export type ComplianceStatus = 'planned' | 'in_progress' | 'evidence_gathering' | 'audit_ready' | 'conditional' | 'not_in_scope';

export type ComplianceControlFamily = {
  id: string;
  name: string;
  description: string;
};

export type ComplianceFramework = {
  id: string;
  name: string;
  priority: string;
  purpose: string;
  defaultStatus: ComplianceStatus;
  scope: string;
  target?: string;
  controls?: ComplianceControlFamily[];
};

export const complianceStatusLabels: Record<ComplianceStatus, string> = {
  planned: 'Planned',
  in_progress: 'In progress',
  evidence_gathering: 'Evidence gathering',
  audit_ready: 'Audit-ready',
  conditional: 'Conditional',
  not_in_scope: 'Not currently in scope',
};

const hipaaControls: ComplianceControlFamily[] = [
  { id: 'hipaa-risk', name: 'Risk Analysis + Risk Management', description: 'Inventory systems and ePHI flows, assess risks and vulnerabilities, document mitigation, and repeat assessments as the environment changes.' },
  { id: 'hipaa-admin', name: 'Administrative Safeguards', description: 'Security responsibility, workforce access, training, incident procedures, contingency planning, evaluations, and business-associate governance.' },
  { id: 'hipaa-physical', name: 'Physical Safeguards', description: 'Facility, workstation, device, and media controls for systems that can access ePHI.' },
  { id: 'hipaa-technical', name: 'Technical Safeguards', description: 'Access control, authentication, audit controls, integrity protection, and transmission security.' },
  { id: 'hipaa-privacy', name: 'Privacy + Minimum Necessary', description: 'Purpose-limited access, disclosure controls, privacy rights, retention, and minimum-necessary handling when PHI is in scope.' },
  { id: 'hipaa-breach', name: 'Breach Response', description: 'Breach assessment, notification workflows, evidence preservation, communications, and business-associate escalation.' },
  { id: 'hipaa-baa', name: 'Business Associate Agreements', description: 'Track BAAs and downstream obligations before regulated PHI is permitted into a project.' },
];

const cmmcControls: ComplianceControlFamily[] = [
  { id: 'cmmc-ac', name: 'Access Control', description: 'Limit system access, remote access, privileged functions, and CUI access to authorized users and devices.' },
  { id: 'cmmc-at', name: 'Awareness + Training', description: 'Security awareness, role-based training, and evidence of workforce understanding.' },
  { id: 'cmmc-au', name: 'Audit + Accountability', description: 'Generate, retain, protect, review, and correlate security audit records.' },
  { id: 'cmmc-cm', name: 'Configuration Management', description: 'Secure baselines, change control, least functionality, inventories, and configuration monitoring.' },
  { id: 'cmmc-ia', name: 'Identification + Authentication', description: 'Unique identity, MFA where required, credential protection, and authenticated device/user access.' },
  { id: 'cmmc-ir', name: 'Incident Response', description: 'Detect, report, analyze, contain, eradicate, recover, test, and retain incident evidence.' },
  { id: 'cmmc-ma', name: 'Maintenance', description: 'Control maintenance tools, remote maintenance, service personnel, and maintenance records.' },
  { id: 'cmmc-mp', name: 'Media Protection', description: 'Protect, sanitize, transport, store, and destroy media containing CUI.' },
  { id: 'cmmc-ps', name: 'Personnel Security', description: 'Screen individuals where appropriate and protect systems during personnel transfers and termination.' },
  { id: 'cmmc-pe', name: 'Physical Protection', description: 'Control physical access to systems, facilities, visitor activity, and physical CUI locations.' },
  { id: 'cmmc-ra', name: 'Risk Assessment', description: 'Assess risk, scan vulnerabilities, prioritize findings, and remediate based on mission and threat impact.' },
  { id: 'cmmc-ca', name: 'Security Assessment', description: 'Assess controls, maintain plans of action, monitor security continuously, and track deficiencies.' },
  { id: 'cmmc-sc', name: 'System + Communications Protection', description: 'Boundary protection, encryption, segmentation, secure communications, and information-flow controls.' },
  { id: 'cmmc-si', name: 'System + Information Integrity', description: 'Flaw remediation, malicious-code protection, security alerts, monitoring, and integrity checks.' },
];

export const complianceFrameworks: ComplianceFramework[] = [
  { id: 'soc2-type1', name: 'SOC 2 Type I', priority: 'Primary', purpose: 'Validate that enterprise security controls are designed and implemented.', defaultStatus: 'planned', scope: 'Enterprise SaaS readiness' },
  { id: 'soc2-type2', name: 'SOC 2 Type II', priority: 'Primary', purpose: 'Demonstrate that security controls operate effectively over an audit period.', defaultStatus: 'planned', scope: 'Enterprise procurement + diligence' },
  { id: 'iso27001', name: 'ISO/IEC 27001', priority: 'Primary', purpose: 'Build a formal information security management system for global enterprise trust.', defaultStatus: 'planned', scope: 'Global enterprise readiness' },
  { id: 'nist-csf', name: 'NIST Cybersecurity Framework', priority: 'Foundation', purpose: 'Organize governance, identification, protection, detection, response, and recovery controls.', defaultStatus: 'in_progress', scope: 'Reusable security control foundation' },
  { id: 'cis-controls', name: 'CIS Controls', priority: 'Foundation', purpose: 'Use prioritized technical safeguards for endpoints, accounts, software, data, and monitoring.', defaultStatus: 'in_progress', scope: 'Reusable technical hardening baseline' },
  { id: 'privacy', name: 'GDPR + U.S. Privacy Program', priority: 'Required', purpose: 'Track privacy notices, consent, data rights, retention, deletion, subprocessors, and cross-border obligations.', defaultStatus: 'in_progress', scope: 'Customer + user data' },
  { id: 'pci', name: 'PCI DSS Scope Management', priority: 'Required', purpose: 'Minimize payment-card scope and delegate raw card handling to validated payment providers where possible.', defaultStatus: 'in_progress', scope: 'Payments' },
  { id: 'pentest', name: 'Independent Penetration Testing', priority: 'Required before enterprise sale', purpose: 'Obtain independent application-security testing and retain remediation evidence.', defaultStatus: 'planned', scope: 'Application + API security' },
  { id: 'incident-bcp', name: 'Incident Response + Business Continuity', priority: 'Required', purpose: 'Document incident handling, backups, recovery objectives, escalation, communications, and exercises.', defaultStatus: 'in_progress', scope: 'Operational resilience' },
  { id: 'vendor-risk', name: 'Vendor + Subprocessor Risk', priority: 'Required', purpose: 'Maintain inventory, security review, data scope, contracts, and incident dependencies for third parties.', defaultStatus: 'in_progress', scope: 'Shared provider + subprocessor governance' },
  { id: 'hipaa', name: 'HIPAA Security + Privacy Foundation', priority: 'Active foundation', purpose: 'Build reusable administrative, physical, technical, privacy, breach-response, and BAA controls so future healthcare projects can be scoped for HIPAA without retrofitting the security architecture.', defaultStatus: 'in_progress', scope: 'Shared backend / healthcare-capable projects', target: 'HIPAA-ready architecture; no HIPAA compliance claim until a regulated project is scoped and validated', controls: hipaaControls },
  { id: 'cmmc', name: 'CMMC / NIST SP 800-171 Foundation', priority: 'Active foundation', purpose: 'Build reusable CUI/FCI security controls and evidence workflows so future defense or federal projects can map to the contract-required CMMC level.', defaultStatus: 'in_progress', scope: 'Shared backend / defense-capable projects', target: 'CMMC Level 2 / NIST SP 800-171-oriented architecture; certification or assessment only when required by a contract/system scope', controls: cmmcControls },
  { id: 'fedramp', name: 'FedRAMP', priority: 'Conditional', purpose: 'Evaluate if a future cloud service is used in a federal environment that requires FedRAMP authorization.', defaultStatus: 'conditional', scope: 'Federal cloud sales' },
];

export const reusableSecurityCore = [
  'Identity, MFA, least privilege, privileged-access review, and tenant/project isolation',
  'Central audit logging, tamper-resistant event history, evidence timestamps, and retention',
  'Encryption in transit and at rest, secrets management, key ownership, and data classification',
  'Secure SDLC, dependency risk, CodeQL/static analysis, vulnerability remediation, and rollback evidence',
  'Incident response, breach workflow, backup/recovery evidence, continuity planning, and exercises',
  'Vendor/subprocessor inventory, data-flow mapping, contract obligations, BAAs when applicable, and third-party risk',
  'Project-specific compliance profiles so one shared backend can apply stricter controls only where required',
] as const;
