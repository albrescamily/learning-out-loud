import { defineCollection, reference, z } from "astro:content";
import { glob } from "astro/loaders";

const writing = defineCollection({
  loader: glob({ pattern: "**/*.md", base: "./src/content/writing" }),
  schema: z.object({
    title: z.string(),
    description: z.string(),
    published: z.coerce.date(),
    minutes: z.number().default(5),
    tags: z.array(z.string()).default([])
  })
});

const notes = defineCollection({
  loader: glob({ pattern: "**/*.md", base: "./src/content/notes" }),
  schema: z.object({
    title: z.string(),
    published: z.coerce.date(),
    tags: z.array(z.string()).default([])
  })
});

const projects = defineCollection({
  loader: glob({ pattern: "**/*.md", base: "./src/content/projects" }),
  schema: z.object({
    title: z.string(),
    description: z.string(),
    status: z.enum(["active", "live", "paused", "done"]),
    stack: z.array(z.string()).default([]),
    order: z.number().default(0)
  })
});

const updates = defineCollection({
  loader: glob({ pattern: "**/*.md", base: "./src/content/updates" }),
  schema: z.object({
    title: z.string(),
    /** Resolved against the projects collection, so a typo fails the build. */
    project: reference("projects"),
    published: z.coerce.date(),
    tags: z.array(z.string()).default([])
  })
});

export const collections = { writing, notes, projects, updates };
