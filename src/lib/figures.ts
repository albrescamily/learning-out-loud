/**
 * Markdown images, rendered as figures.
 *
 * A paragraph whose only content is an image is not a paragraph — it is a
 * figure. This rewrites `<p><img></p>` into `<figure><img></figure>`, so the
 * spacing and border rules in `.prose` have a block to hang on, and promotes
 * the image's Markdown title into a `<figcaption>`:
 *
 *     ![alt text](../images/diagram.png "The caption")
 *
 * The title is dropped from the image afterwards, so the caption is not also
 * repeated as a hover tooltip. `alt` is left alone and never becomes the
 * caption: it describes the image for people who cannot see it, which is a
 * different job from a line printed under it.
 *
 * An image with text beside it is left as it is — that one is inline, and
 * inline images take no caption.
 *
 * This runs before Astro's own image pass (user plugins go first), which is
 * what turns a relative `src` into an optimized asset. Rebuilding the `img`
 * here keeps its properties, so that pass still sees the image it expects.
 *
 * When editing this file: rendered Markdown is cached in `.astro/`, keyed by
 * the content file, so a build after a change here re-emits the *old* HTML for
 * files that did not change. Touch the entry, or delete `.astro/`, to see the
 * new output.
 */
import type { Element, ElementContent } from "hast";
import type { HastPluginDefinition } from "satteri";

/** Whitespace between block elements is a text node; it is not content. */
function contentOf(node: Element): ElementContent[] {
  return node.children.filter(
    child => child.type !== "text" || child.value.trim() !== ""
  );
}

/** The single child of `node`, or undefined when it holds anything else. */
function onlyChild(node: Element): ElementContent | undefined {
  const children = contentOf(node);
  return children.length === 1 ? children[0] : undefined;
}

function isElement(node: ElementContent | undefined, tagName: string): node is Element {
  return node?.type === "element" && node.tagName === tagName;
}

/**
 * How wide a figure actually renders, so the browser picks the right file from
 * the srcset Astro generates. Left to itself it assumes `100vw` and downloads a
 * viewport-wide image for a 720px column.
 *
 * These are the widths from `src/styles/global.css`: the prose column caps at
 * 720px, and below that the container is the viewport minus its gutters — 96px,
 * dropping to 32px at the 640px breakpoint.
 */
const FIGURE_SIZES =
  "(min-width: 816px) 720px, (min-width: 640px) calc(100vw - 96px), calc(100vw - 32px)";

/** A fresh `img`, minus the title the caption took over. */
function imageWithoutTitle(image: Element): Element {
  const { title: _title, ...properties } = image.properties ?? {};
  return {
    type: "element",
    tagName: "img",
    properties: { sizes: FIGURE_SIZES, ...properties },
    children: []
  };
}

export const figures: HastPluginDefinition = {
  name: "figures",
  element: {
    filter: ["p"],
    visit(paragraph) {
      const child = onlyChild(paragraph);

      // Either a bare image or one wrapped in a link — Markdown writes the
      // linked form as `[![alt](image)](href)`, still alone in its paragraph.
      const link = isElement(child, "a") ? child : undefined;
      const inner = link ? onlyChild(link) : child;
      if (!isElement(inner, "img")) return;

      const image = imageWithoutTitle(inner);
      const media: ElementContent = link
        ? { type: "element", tagName: "a", properties: { ...link.properties }, children: [image] }
        : image;

      const title = inner.properties?.title;
      const caption = typeof title === "string" ? title.trim() : "";

      return {
        type: "element",
        tagName: "figure",
        properties: {},
        children: caption
          ? [
              media,
              {
                type: "element",
                tagName: "figcaption",
                properties: {},
                children: [{ type: "text", value: caption }]
              }
            ]
          : [media]
      } satisfies Element;
    }
  }
};
