import { describe, expect, it } from "vitest";
import {
  audienceNotePath,
  formatAudienceNotesBlock,
  notesStorageKey,
  parseNoteAudiences,
  parseNoteLanguages,
  releaseNotesInstructions,
  type AudienceNotes,
} from "@/lib/notes";

describe("audience notes config", () => {
  it("parses audiences and languages", () => {
    expect(parseNoteAudiences(["technical", "customer", "internal"])).toEqual(["technical", "customer"]);
    expect(parseNoteAudiences("technical")).toEqual(["technical"]);
    expect(parseNoteLanguages(["en", "es", "fr"])).toEqual(["en", "es"]);
    expect(parseNoteLanguages(null)).toEqual(["en", "es"]);
  });

  it("builds stable storage keys and repo paths", () => {
    expect(notesStorageKey("luigi/demo", "v1.2.0")).toBe("luigi/demo::notes::1.2.0");
    expect(audienceNotePath("v1.2.0", "customer", "es")).toBe(".shiplog/notes/1.2.0/customer.es.md");
  });

  it("formats a comment block without pipe characters", () => {
    const notes: AudienceNotes = {
      technical: { en: "API `POST /widgets` added.", es: "Se agregó la API." },
      customer: { en: "You can add widgets faster.", es: "Podés crear widgets más rápido." },
    };
    const block = formatAudienceNotesBlock("v1.0.0", notes);
    expect(block).toContain("Technical (en)");
    expect(block).toContain("Customer (es)");
    expect(block).not.toContain("|");
  });

  it("extends the release agent prompt with file paths", () => {
    const text = releaseNotesInstructions("v2.0.0", ["technical", "customer"], ["en", "es"]);
    expect(text).toContain(".shiplog/notes/2.0.0/technical.en.md");
    expect(text).toContain("customer.es.md");
    expect(text).not.toContain("|");
  });
});

describe("notes in .shiplog.yml", () => {
  it("reads notes audiences and languages", async () => {
    const { parseConfig } = await import("@/lib/config");
    const c = parseConfig(`
notes:
  audiences: [technical, customer]
  languages: [es, en]
`);
    expect(c.notes.audiences).toEqual(["technical", "customer"]);
    expect(c.notes.languages).toEqual(["es", "en"]);
    expect(parseConfig("notes:\n  audiences: []\n").notes.audiences).toEqual([]);
    expect(parseConfig(null).notes.audiences).toEqual([]);
  });
});
