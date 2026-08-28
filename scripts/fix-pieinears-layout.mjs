import fs from 'node:fs';

const path = 'app/layout.tsx';
if (fs.existsSync(path)) {
  let source = fs.readFileSync(path, 'utf8');
  source = source.replace(
    "description: 'PieInEars — The Kitchen's Open. Let Them Cook.',",
    `description: "PieInEars — The Kitchen's Open. Let Them Cook.",`,
  );
  fs.writeFileSync(path, source);
}
console.log('Fixed PieInEars metadata apostrophe.');
