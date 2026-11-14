export interface ActivePolicyRule {
  id?: string;
  category?: string;
  attachmentType?: string;
  sensitivity?: string;
  storage?: string;
}

export interface DecisionInput {
  category: string;
  attachmentType: string;
  sensitivity: string;
  sizeMiB?: number;
}

export interface RuleStep {
  rule: ActivePolicyRule;
  matches: boolean;
  selected: boolean;
  index: number;
}

export interface DecisionResult {
  matchedRule: ActivePolicyRule | null;
  orderedRules: RuleStep[];
  configuredDestination: string | null;
  allowedDestinations: string[];
  destination: string | null;
  constraintReason: string;
  ruleReason: string;
  technology: string;
  transferProtocol: string;
  targetAccepted: boolean;
  policyAvailable: boolean;
}

const technology: Record<string, string> = {
  DATABASE: "Database · PostgreSQL",
  S3: "Object storage · MinIO / S3",
  FTP: "FTP service",
};

export function ruleMatches(rule: ActivePolicyRule, input: DecisionInput): boolean {
  return rule.category === input.category &&
    (rule.attachmentType === undefined || rule.attachmentType === input.attachmentType) &&
    (rule.sensitivity === undefined || rule.sensitivity === input.sensitivity);
}

export function requiredDestination(input: DecisionInput): { storage: string[]; reason: string } {
  if (input.category === "METER_READING")
    return { storage: ["DATABASE"], reason: "Citirile de contor se păstrează în baza de date pentru identitate și deduplicare." };
  if (input.category === "CONNECTION_DOCUMENT")
    return { storage: ["S3"], reason: "Documentele de racordare rămân în object storage privat; conținutul este criptat de aplicație." };
  if (input.category === "DRONE_VIDEO")
    return { storage: ["S3"], reason: "Videoclipurile folosesc object storage și sesiuni reluabile." };
  if (input.category === "INCIDENT" && input.attachmentType === "LEGACY_LOG" && input.sensitivity === "NON_SENSITIVE")
    return { storage: ["S3", "FTP"], reason: "Pentru loguri legacy nesensibile sunt permise S3 și FTP; politica activă decide între ele." };
  return { storage: ["S3"], reason: "Atașamentele de avarie care nu sunt loguri legacy nesensibile folosesc object storage." };
}

export function decideDestination(
  rules: ActivePolicyRule[], input: DecisionInput, hypotheticalTarget: string,
): DecisionResult {
  const orderedRules = rules.map((rule, index) => ({ rule, index, matches: ruleMatches(rule, input), selected: false }));
  const firstMatch = orderedRules.find(step => step.matches);
  if (firstMatch) firstMatch.selected = true;
  const matchedRule = firstMatch?.rule || null;
  const required = requiredDestination(input);
  const configuredDestination = matchedRule?.storage || null;
  const destination = configuredDestination && required.storage.includes(configuredDestination)
    ? configuredDestination
    : null;
  const constraintReason = configuredDestination && !required.storage.includes(configuredDestination)
    ? `Configurația activă indică ${configuredDestination}, permisă nu este. Backend-ul validează aceste constrângeri la pornire.`
    : required.reason;
  const ruleReason = matchedRule
    ? destination
      ? `Prima regulă potrivită în ordinea configurației este ${matchedRule.id || `regula ${orderedRules.findIndex(step => step.rule === matchedRule) + 1}`}.`
      : `Prima potrivire (${matchedRule.id || "regulă fără ID"}) încalcă constrângerile; destinația nu poate fi confirmată.`
    : "Nicio regulă activă nu se potrivește; API-ul ar refuza decizia (NO_POLICY). Constrângerea indică doar destinațiile permise, nu creează o regulă.";
  const sizeMiB = input.sizeMiB ?? 0;
  const transferProtocol = input.category === "METER_READING"
    ? "Ingestie automată JSON prin endpoint-ul de citiri; nu este upload manual."
    : input.category === "DRONE_VIDEO"
      ? sizeMiB > 20 * 1024
        ? "Peste limita API de 20 GiB; sesiunea nu poate fi creată. Sub limită folosește multipart reluabil, în părți de 8 MiB."
        : "Multipart reluabil, părți de 8 MiB (protocolul categoriei; nu este câmp de policy)."
      : sizeMiB > 10
        ? "Peste 10 MiB, upload-ul manual este în afara limitei API; multipart este rezervat categoriei dronă."
        : "Sesiune SINGLE până la 10 MiB (modul efectiv este confirmat de sesiunea API; nu este câmp de policy).";
  return {
    matchedRule, orderedRules, configuredDestination, allowedDestinations: required.storage,
    destination, constraintReason, ruleReason,
    technology: technology[destination || ""] || destination || "Nicio destinație activă",
    transferProtocol,
    targetAccepted: required.storage.includes(hypotheticalTarget),
    policyAvailable: !!matchedRule && !!destination,
  };
}
