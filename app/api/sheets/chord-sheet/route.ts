import OpenAI from 'openai';
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
import { NextResponse } from 'next/server';
import { rateLimit, readJsonObject, safeClientError, safeId, textField } from '../../../security';
import { getChordResult } from '../klangio';
import { signedStagingUrl } from '../staging';

export const runtime = 'nodejs';
export const maxDuration = 300;

type RawChord = [number, number, string];
type ChordEvent = { start:number; end:number; label:string };
type TranscriptWord = { word:string; start:number; end:number };
type TranscriptSegment = { text:string; start:number; end:number };
export type ChordSheetLine = { section?:string; chords:string; lyrics:string; start:number; end:number };
export type ChordSheet = { title:string; likelyKey?:string; lines:ChordSheetLine[]; generatedAt:string };

function normalizedChord(raw:string){
  let value=String(raw||'').trim();
  if(!value||/^(N|no[_ -]?chord)$/i.test(value))return '';
  value=value.replace(/♯/g,'#').replace(/♭/g,'b');
  const match=value.match(/^([A-G](?:#|b)?):([^/]+)(\/.*)?$/);
  if(match){
    const root=match[1];
    const quality=match[2].toLowerCase();
    const bass=match[3]||'';
    const map:Record<string,string>={
      maj:'',min:'m',major:'',minor:'m','7':'7',maj7:'maj7',min7:'m7',m7:'m7',
      dim:'dim',dim7:'dim7',hdim7:'m7b5',aug:'aug',sus2:'sus2',sus4:'sus4',
      '6':'6',min6:'m6',maj6:'6','9':'9',maj9:'maj9',min9:'m9',add9:'add9',
    };
    const suffix=map[quality] ?? quality.replace(/^min/,'m').replace(/^maj$/,'');
    return `${root}${suffix}${bass}`;
  }
  return value.replace(/:maj\b/gi,'').replace(/:min\b/gi,'m').replace(/:/g,'');
}

function cleanChords(rows:RawChord[]):ChordEvent[]{
  const events=rows
    .map(([start,end,label])=>({start:Number(start),end:Number(end),label:normalizedChord(label)}))
    .filter(item=>item.label&&Number.isFinite(item.start)&&Number.isFinite(item.end)&&item.end>item.start)
    .sort((a,b)=>a.start-b.start);

  const merged:ChordEvent[]=[];
  for(const item of events){
    const last=merged[merged.length-1];
    if(last&&last.label===item.label&&item.start-last.end<0.45){last.end=Math.max(last.end,item.end);continue;}
    merged.push({...item});
  }

  for(let i=1;i<merged.length-1;i++){
    const current=merged[i];
    if(current.end-current.start<0.32&&merged[i-1].label===merged[i+1].label){
      merged[i-1].end=merged[i+1].end;
      merged.splice(i,2);
      i-=1;
    }
  }
  return merged;
}

function likelyKey(events:ChordEvent[]){
  const weights=new Map<string,number>();
  for(const event of events){
    const root=event.label.match(/^([A-G](?:#|b)?)/)?.[1];
    if(!root)continue;
    const minor=/^[A-G](?:#|b)?m(?!aj)/.test(event.label);
    const key=`${root} ${minor?'minor':'major'}`;
    weights.set(key,(weights.get(key)||0)+Math.max(0.1,event.end-event.start));
  }
  const ranked=[...weights.entries()].sort((a,b)=>b[1]-a[1]);
  return ranked[0]?.[0];
}

function activeChordAt(events:ChordEvent[],time:number){
  let chosen:ChordEvent|undefined;
  for(const event of events){
    if(event.start>time)break;
    if(event.end>=time-0.15)chosen=event;
  }
  return chosen;
}

function placeChord(chars:string[],label:string,pos:number){
  if(!label)return;
  let at=Math.max(0,Math.min(pos,Math.max(0,chars.length-label.length)));
  while(at<chars.length&&chars.slice(at,Math.min(chars.length,at+label.length)).some(ch=>ch!==' '))at+=1;
  for(let i=0;i<label.length;i++){
    if(at+i>=chars.length)chars.push(' ');
    chars[at+i]=label[i];
  }
}

function lineFromWords(words:TranscriptWord[],events:ChordEvent[]):ChordSheetLine{
  const pieces:string[]=[];
  const offsets:number[]=[];
  for(const item of words){
    const token=item.word.trim();
    if(!token)continue;
    const needsSpace=pieces.length>0&&!/^[,.;!?':)\]}]/.test(token);
    const prefix=needsSpace?' ':'';
    const currentLength=pieces.join('').length;
    offsets.push(currentLength+prefix.length);
    pieces.push(prefix+token);
  }
  const lyrics=pieces.join('').trim()||'Instrumental';
  const start=words[0]?.start||0;
  const end=words[words.length-1]?.end||start+1;
  const chordChars=Array(Math.max(lyrics.length+18,24)).fill(' ');
  const first=activeChordAt(events,start);
  if(first)placeChord(chordChars,first.label,0);
  const inRange=events.filter(event=>event.start>=start-0.1&&event.start<=end+0.1);
  for(const chord of inRange){
    let nearest=0;let distance=Infinity;
    words.forEach((word,index)=>{const d=Math.abs(word.start-chord.start);if(d<distance){distance=d;nearest=index;}});
    placeChord(chordChars,chord.label,offsets[nearest]||0);
  }
  return {chords:chordChars.join('').trimEnd(),lyrics,start,end};
}

function fallbackLines(segments:TranscriptSegment[],events:ChordEvent[]):ChordSheetLine[]{
  return segments.filter(segment=>segment.text.trim()).map(segment=>{
    const lyrics=segment.text.trim();
    const found=events.filter(event=>event.start<=segment.end&&event.end>=segment.start);
    const labels=[...new Set(found.map(event=>event.label))];
    return {chords:labels.join('   '),lyrics,start:segment.start,end:segment.end};
  });
}

function phraseWords(words:TranscriptWord[]){
  const groups:TranscriptWord[][]=[];
  let group:TranscriptWord[]=[];
  for(const word of words){
    group.push(word);
    const token=word.word.trim();
    const duration=group.length?word.end-group[0].start:0;
    if(/[.!?]$/.test(token)||group.length>=11||duration>=6.5){groups.push(group);group=[];}
  }
  if(group.length)groups.push(group);
  return groups;
}

async function sectionStarts(client:OpenAI,lines:ChordSheetLine[]){
  if(!lines.length)return new Map<number,string>();
  try{
    const compact=lines.slice(0,80).map((line,index)=>`${index}: ${line.lyrics}`).join('\n');
    const response=await client.responses.create({
      model:process.env.OPENAI_TEXT_MODEL||'gpt-5.6',
      input:[
        {role:'system',content:'You label song sections. Do not rewrite or quote the lyrics. Return only JSON: an array of objects with integer index and a short label such as Intro, Verse 1, Pre-Chorus, Chorus, Verse 2, Bridge, Final Chorus, Outro. Add an object only where a new section begins.'},
        {role:'user',content:`Label the section starts for these ordered lyric-line indices:\n${compact}`},
      ],
      max_output_tokens:700,
    });
    const raw=response.output_text||'';
    const match=raw.match(/\[[\s\S]*\]/);
    if(!match)return new Map<number,string>();
    const parsed=JSON.parse(match[0]);
    const result=new Map<number,string>();
    if(Array.isArray(parsed))for(const item of parsed){
      const index=Number(item?.index);const label=String(item?.label||'').slice(0,40);
      if(Number.isInteger(index)&&index>=0&&index<lines.length&&label)result.set(index,label);
    }
    return result;
  }catch{return new Map<number,string>();}
}

async function fetchSourceAudio(stagedPath:string){
  if(!stagedPath.startsWith('pie-primary/staging/')||stagedPath.includes('..')||stagedPath.includes('\\'))throw new Error('INVALID_SOURCE_PATH');
  const signed=await signedStagingUrl(stagedPath);
  const response=await fetch(signed,{cache:'no-store'});
  if(!response.ok)throw new Error('SOURCE_AUDIO_NOT_FOUND');
  const bytes=await response.arrayBuffer();
  if(!bytes.byteLength||bytes.byteLength>25*1024*1024)throw new Error('SOURCE_AUDIO_TOO_LARGE_FOR_LYRICS');
  return new File([bytes],'song-audio',{type:response.headers.get('content-type')||'audio/wav'});
}

async function generateChart(body:Record<string,unknown>):Promise<ChordSheet>{
  if(!process.env.OPENAI_API_KEY)throw new Error('OPENAI_NOT_CONFIGURED');
  const chordJobId=safeId(body.chordJobId,180);
  const stagedPath=textField(body.stagedPath,500);
  const title=textField(body.title,120,'Untitled Song');
  const raw=await getChordResult(chordJobId);
  const events=cleanChords(raw);
  if(!events.length)throw new Error('NO_CHORDS_DETECTED');

  const client=new OpenAI({apiKey:process.env.OPENAI_API_KEY});
  const file=await fetchSourceAudio(stagedPath);
  const transcript=await client.audio.transcriptions.create({
    file,
    model:process.env.OPENAI_TRANSCRIBE_MODEL||'whisper-1',
    response_format:'verbose_json',
    timestamp_granularities:['word','segment'],
  } as never) as unknown as {text?:string;words?:TranscriptWord[];segments?:TranscriptSegment[]};

  const words=Array.isArray(transcript.words)?transcript.words.filter(item=>item&&Number.isFinite(item.start)&&Number.isFinite(item.end)&&typeof item.word==='string'):[];
  const segments=Array.isArray(transcript.segments)?transcript.segments.filter(item=>item&&Number.isFinite(item.start)&&Number.isFinite(item.end)&&typeof item.text==='string'):[];
  let lines=words.length?phraseWords(words).map(group=>lineFromWords(group,events)):fallbackLines(segments,events);
  if(!lines.length&&transcript.text?.trim())lines=[{chords:[...new Set(events.slice(0,8).map(item=>item.label))].join('   '),lyrics:transcript.text.trim(),start:0,end:events[events.length-1]?.end||0}];
  if(!lines.length)throw new Error('NO_LYRICS_TRANSCRIBED');

  const labels=await sectionStarts(client,lines);
  lines=lines.map((line,index)=>({...line,section:labels.get(index)}));
  if(!lines.some(line=>line.section))lines=lines.map((line,index)=>({...line,section:index===0?'Verse 1':index%4===0?`Section ${Math.floor(index/4)+1}`:undefined}));
  return {title,likelyKey:likelyKey(events),lines,generatedAt:new Date().toISOString()};
}

function safeChart(value:unknown):ChordSheet{
  if(!value||typeof value!=='object'||Array.isArray(value))throw new Error('INVALID_CHART');
  const raw=value as Record<string,unknown>;
  const title=textField(raw.title,120,'Untitled Song');
  const likelyKey=raw.likelyKey?textField(raw.likelyKey,40):undefined;
  if(!Array.isArray(raw.lines)||raw.lines.length>120)throw new Error('INVALID_CHART');
  const lines:ChordSheetLine[]=raw.lines.map(item=>{
    if(!item||typeof item!=='object'||Array.isArray(item))throw new Error('INVALID_CHART');
    const row=item as Record<string,unknown>;
    return {section:row.section?textField(row.section,40):undefined,chords:textField(row.chords,180),lyrics:textField(row.lyrics,500),start:Number(row.start)||0,end:Number(row.end)||0};
  });
  return {title,likelyKey,lines,generatedAt:new Date().toISOString()};
}

async function renderPdf(chart:ChordSheet){
  const pdf=await PDFDocument.create();
  const regular=await pdf.embedFont(StandardFonts.Courier);
  const bold=await pdf.embedFont(StandardFonts.CourierBold);
  const sectionFont=await pdf.embedFont(StandardFonts.HelveticaBoldOblique);
  const pageSize:[number,number]=[612,792];
  const margin=46;
  let page=pdf.addPage(pageSize);
  let y=744;
  const drawHeader=()=>{
    page.drawText(chart.title,{x:margin,y,size:18,font:bold,color:rgb(.08,.08,.1)});y-=24;
    const meta=[chart.likelyKey?`Likely key: ${chart.likelyKey}`:'', 'Chord + Lyric Sheet'].filter(Boolean).join('  •  ');
    page.drawText(meta,{x:margin,y,size:9,font:regular,color:rgb(.35,.35,.4)});y-=24;
  };
  const nextPage=()=>{page=pdf.addPage(pageSize);y=744;drawHeader();};
  drawHeader();
  for(const line of chart.lines){
    const need=(line.section?20:0)+28;
    if(y<70+need)nextPage();
    if(line.section){y-=4;page.drawText(line.section,{x:margin,y,size:11,font:sectionFont,color:rgb(.15,.15,.2)});y-=16;}
    const maxChars=74;
    const chordText=(line.chords||'').slice(0,maxChars);
    const lyricText=(line.lyrics||'').slice(0,maxChars);
    if(chordText)page.drawText(chordText,{x:margin,y,size:9.5,font:bold,color:rgb(.08,.08,.11)});
    y-=12;
    page.drawText(lyricText,{x:margin,y,size:9.5,font:regular,color:rgb(.12,.12,.14)});
    y-=17;
  }
  for(const p of pdf.getPages()){
    p.drawLine({start:{x:margin,y:38},end:{x:612-margin,y:38},thickness:.5,color:rgb(.82,.82,.86)});
    p.drawText('Pie • Chord / Lyric Sheet',{x:margin,y:24,size:7.5,font:regular,color:rgb(.45,.45,.5)});
  }
  return pdf.save();
}

export async function POST(req:Request){
  const limited=rateLimit(req,'chord-lyric-sheet',8,60_000);
  if(limited)return limited;
  try{
    const body=await readJsonObject(req,180_000);
    const action=textField(body.action,20,'generate');
    if(action==='generate'){
      const chart=await generateChart(body);
      return NextResponse.json({chart},{headers:{'Cache-Control':'no-store'}});
    }
    if(action==='pdf'){
      const chart=safeChart(body.chart);
      const bytes=await renderPdf(chart);
      return new NextResponse(Buffer.from(bytes),{headers:{'Content-Type':'application/pdf','Content-Disposition':'attachment; filename="pie-chord-lyrics.pdf"','Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff'}});
    }
    throw new Error('INVALID_ACTION');
  }catch(error){
    console.error('Chord + lyric sheet failed',error);
    const message=error instanceof Error?error.message:'';
    if(message==='SOURCE_AUDIO_TOO_LARGE_FOR_LYRICS')return NextResponse.json({error:'This recording is too large for lyric transcription. Use a compressed audio version under 25 MB.'},{status:413,headers:{'Cache-Control':'no-store'}});
    if(message==='NO_CHORDS_DETECTED')return NextResponse.json({error:'Pie could not find reliable chords in this recording.'},{status:422,headers:{'Cache-Control':'no-store'}});
    return NextResponse.json({error:safeClientError(error,'Could not create the chord + lyric sheet.')},{status:400,headers:{'Cache-Control':'no-store'}});
  }
}
