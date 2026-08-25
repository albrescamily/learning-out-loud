---
title: "What I got wrong about backpressure"
description: "I blamed the consumer. The real bottleneck was further upstream."
published: 2026-08-12
minutes: 9
tags: ["distributed systems", "kafka"]
---

For two weeks I treated consumer lag as evidence that the consumer itself was too slow.

That assumption sent me in the wrong direction.

## The useful mistake

The queue was telling me about pressure, but not necessarily where that pressure started.

Once I instrumented the producer path and batching behavior, the actual bottleneck became much easier to see.

## Takeaway

Observe the whole path before optimizing the component that looks guilty.
