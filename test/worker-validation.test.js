import test from "node:test";
import assert from "node:assert/strict";
import { validateSiteContent, validateSurveyConfig } from "../src/worker.js";

const sectionOrder = ["intro", "news", "claims", "rights", "survey", "contact"];
const priorityValues = [
  "salary", "commissions", "staffing", "schedules", "workload", "training",
  "career", "management", "health", "recognition", "other",
];

function validSurveyConfig() {
  return {
    conditions: "Comment évaluez-vous vos conditions de travail ?",
    priorities: "Quels sujets sont prioritaires ?",
    recognition: "Vous sentez-vous reconnu(e) ?",
    comment: "Quelle amélioration est urgente ?",
    priorityOptions: priorityValues.map(value => ({ value, label: value })),
  };
}

function validClaims() {
  return {
    eyebrow: "Nos engagements",
    title: "Nos revendications",
    lead: "Un texte de présentation.",
    items: [{
      icon: "€",
      number: "01",
      title: "Salaires",
      bullets: ["Revaloriser les rémunérations"],
    }],
    commitmentTitle: "Notre engagement",
    commitmentText: "Un engagement collectif.",
    disclaimer: "Texte indicatif.",
  };
}

function validRights() {
  return {
    eyebrow: "Vos droits",
    title: "Mieux connaître vos droits",
    lead: "Des repères pratiques.",
    topics: [{ icon: "⚖️", number: "01", title: "Contrat de travail" }],
    contactTitle: "Besoin d'aide ?",
    contactText: "Contactez vos représentants.",
  };
}

test("accepts a complete section order with each section exactly once", () => {
  assert.equal(validateSiteContent("section_order", { order: sectionOrder }), true);
});

test("rejects an incomplete, duplicated or unknown section order", () => {
  assert.equal(validateSiteContent("section_order", { order: sectionOrder.slice(1) }), false);
  assert.equal(validateSiteContent("section_order", { order: [...sectionOrder.slice(1), "intro", "intro"] }), false);
  assert.equal(validateSiteContent("section_order", { order: [...sectionOrder.slice(0, 5), "unknown"] }), false);
});

test("accepts valid claims content", () => {
  assert.equal(validateSiteContent("claims", validClaims()), true);
});

test("rejects claims with too many items or malformed bullets", () => {
  const tooMany = validClaims();
  tooMany.items = Array.from({ length: 21 }, () => validClaims().items[0]);
  assert.equal(validateSiteContent("claims", tooMany), false);

  const malformed = validClaims();
  malformed.items[0].bullets = ["ok", 42];
  assert.equal(validateSiteContent("claims", malformed), false);
});

test("accepts valid rights content", () => {
  assert.equal(validateSiteContent("rights", validRights()), true);
});

test("rejects unknown content keys and non-object values", () => {
  assert.equal(validateSiteContent("homepage", validClaims()), false);
  assert.equal(validateSiteContent("claims", []), false);
  assert.equal(validateSiteContent("claims", null), false);
});

test("accepts the complete survey configuration and its fixed option set", () => {
  assert.equal(validateSurveyConfig(validSurveyConfig()), true);
});

test("rejects missing, duplicate, unknown or empty survey options", () => {
  const missing = validSurveyConfig();
  missing.priorityOptions.pop();
  assert.equal(validateSurveyConfig(missing), false);

  const duplicate = validSurveyConfig();
  duplicate.priorityOptions[10].value = "salary";
  assert.equal(validateSurveyConfig(duplicate), false);

  const unknown = validSurveyConfig();
  unknown.priorityOptions[10].value = "unknown";
  assert.equal(validateSurveyConfig(unknown), false);

  const emptyLabel = validSurveyConfig();
  emptyLabel.priorityOptions[0].label = "  ";
  assert.equal(validateSurveyConfig(emptyLabel), false);
});

test("rejects empty and overlong survey questions", () => {
  const empty = validSurveyConfig();
  empty.conditions = "  ";
  assert.equal(validateSurveyConfig(empty), false);

  const overlong = validSurveyConfig();
  overlong.comment = "x".repeat(301);
  assert.equal(validateSurveyConfig(overlong), false);
});
