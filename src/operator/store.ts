import { mkdir, readFile, writeFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import type { OperatorTask, OperatorTaskType } from "./types.ts";

const ROOT = resolve(fileURLToPath(new URL("../../", import.meta.url)));
const DIR = join(ROOT, "data", "operator");
const FILE = join(DIR, "tasks.json");

async function load(): Promise<OperatorTask[]> {
  try {
    const parsed = JSON.parse(await readFile(FILE, "utf8")) as unknown;
    return Array.isArray(parsed) ? (parsed as OperatorTask[]) : [];
  } catch {
    return [];
  }
}

async function save(tasks: OperatorTask[]): Promise<void> {
  await mkdir(DIR, { recursive: true });
  await writeFile(FILE, `${JSON.stringify(tasks, null, 2)}\n`, "utf8");
}

export async function listOperatorTasks(): Promise<OperatorTask[]> {
  return (await load()).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export async function getOperatorTask(id: string): Promise<OperatorTask | undefined> {
  return (await load()).find((t) => t.id === id);
}

export async function createOperatorTask(input: {
  type: OperatorTaskType;
  prompt: string;
  to?: string;
  subject?: string;
  platforms?: string[];
  imageUrl?: string;
  videoUrl?: string;
  thumbnailUrl?: string;
  altText?: string;
  scheduledAt?: string;
  channelIds?: string[];
}): Promise<OperatorTask> {
  const now = new Date().toISOString();
  const task: OperatorTask = {
    id: `op_${Date.now().toString(36)}_${randomUUID().slice(0, 8)}`,
    type: input.type,
    prompt: input.prompt.trim(),
    status: "queued",
    createdAt: now,
    updatedAt: now,
    meta: {
      ...(input.to ? { to: input.to } : {}),
      ...(input.subject ? { subject: input.subject } : {}),
      ...(input.platforms?.length ? { platforms: input.platforms } : {}),
      ...(input.imageUrl ? { imageUrl: input.imageUrl } : {}),
      ...(input.videoUrl ? { videoUrl: input.videoUrl } : {}),
      ...(input.thumbnailUrl ? { thumbnailUrl: input.thumbnailUrl } : {}),
      ...(input.altText ? { altText: input.altText } : {}),
      ...(input.scheduledAt ? { scheduledAt: input.scheduledAt } : {}),
      ...(input.channelIds?.length ? { channelIds: input.channelIds } : {}),
    },
  };
  const tasks = await load();
  tasks.push(task);
  await save(tasks);
  return task;
}

export async function updateOperatorTask(id: string, patch: Partial<OperatorTask>): Promise<OperatorTask | undefined> {
  const tasks = await load();
  const index = tasks.findIndex((t) => t.id === id);
  if (index < 0) return undefined;
  const current = tasks[index]!;
  const next: OperatorTask = {
    ...current,
    ...patch,
    meta: { ...current.meta, ...(patch.meta ?? {}) },
    updatedAt: new Date().toISOString(),
  };
  tasks[index] = next;
  await save(tasks);
  return next;
}
