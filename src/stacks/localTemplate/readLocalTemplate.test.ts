import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { LocalTemplateError, readLocalTemplate } from "./readLocalTemplate.js";

describe("readLocalTemplate", () => {
  let root: string;

  beforeEach(async () => {
    root = await mkdtemp(path.join(tmpdir(), "promoteops-templates-"));
  });

  afterEach(async () => {
    await rm(root, { recursive: true, force: true });
  });

  it("reads a template relative to the local templates root", async () => {
    await writeFile(path.join(root, "payments.yaml"), "Resources: {}\n", "utf8");
    await expect(readLocalTemplate(root, "payments.yaml")).resolves.toBe("Resources: {}\n");
  });

  it("rejects path traversal", async () => {
    await expect(readLocalTemplate(root, "../secret.yaml")).rejects.toThrow(LocalTemplateError);
  });

  it("fails when the file is missing", async () => {
    await expect(readLocalTemplate(root, "missing.yaml")).rejects.toThrow(LocalTemplateError);
  });

  it("allows nested template paths under the root", async () => {
    await mkdir(path.join(root, "nested"), { recursive: true });
    await writeFile(path.join(root, "nested", "app.yaml"), "AWSTemplateFormatVersion: '2010-09-09'\n");
    await expect(readLocalTemplate(root, "nested/app.yaml")).resolves.toContain("AWSTemplateFormatVersion");
  });

  it("resolves an extensionless mapper key to a .yaml file on disk", async () => {
    await writeFile(path.join(root, "sqs-demo.yaml"), "Resources: {}\n", "utf8");
    await expect(readLocalTemplate(root, "sqs-demo")).resolves.toBe("Resources: {}\n");
  });

  it("resolves an extensionless mapper key to a .json file on disk", async () => {
    await writeFile(path.join(root, "queue.json"), "{}\n", "utf8");
    await expect(readLocalTemplate(root, "queue")).resolves.toBe("{}\n");
  });

  it("fails when no extension variant exists for an extensionless name", async () => {
    await expect(readLocalTemplate(root, "does-not-exist")).rejects.toThrow(LocalTemplateError);
  });

  it("does not fall back to other extensions when the name already has one", async () => {
    await writeFile(path.join(root, "payments.yaml"), "Resources: {}\n", "utf8");
    await expect(readLocalTemplate(root, "payments.json")).rejects.toThrow(LocalTemplateError);
  });
});
