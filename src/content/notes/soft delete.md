---
title: "Soft Delete"
# YYYY-MM-DD. Sorts the archive and the home rail.
published: 2026-08-24
---


Soft delete is a technique where the system deletes a recrod logically but keeps it physiaclly in the database, typically using a mechanism such as boolean flag (is_deleted?). Since the record is not deleted, queries filters them at read time. 

It is considered an anti-pattern, since its something the developer intends to do: access old data without the risk of deleting. 
