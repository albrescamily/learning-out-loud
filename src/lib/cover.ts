/**
 * A project's cover: the first image in its body.
 *
 * Nothing to set in the frontmatter, so a project written in Obsidian gets a
 * thumbnail as soon as it has a screenshot in it. Only images in the shared
 * `src/content/images/` folder count, written the way the README there says:
 *
 *     ![alt](../images/diagram.png)
 *     ![alt](<../images/Pasted image 20261002230104.png>)
 */
import type { ImageMetadata } from "astro";

const images = import.meta.glob<{ default: ImageMetadata }>(
  "/src/content/images/*.{png,jpg,jpeg,webp,gif,avif}",
  { eager: true }
);

const FIRST_IMAGE = /!\[[^\]]*\]\(\s*(?:<\.\.\/images\/([^>]+)>|\.\.\/images\/([^\s)]+))/;

export function coverOf(body: string | undefined): ImageMetadata | undefined {
  const match = body?.match(FIRST_IMAGE);
  if (!match) return undefined;
  const file = match[1] ?? match[2];
  return images[`/src/content/images/${file}`]?.default;
}
