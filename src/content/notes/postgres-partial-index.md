---
title: "Postgres partial indexes can include a WHERE clause"
published: 2026-08-20
tags: ["postgres", "database"]
---

A partial index only contains rows matching a predicate.

That can reduce index size when most rows are irrelevant to the queries you care about.
