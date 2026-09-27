---
title: write ahead logging
published: 2026-09-11T00:00:00.000Z
---


![396](<../images/Pasted image 20260830164502.png>)


log-first, apply-late

The systems write the change to a WAL, instead of writing directly into the main storage. Its a way of to guarantee the ATOMIC principles inside the databases mechanisms.

Its very simple: 
All the changes are registered in a permanent storage log before its changes are applied in the main data store (as tables and indexes)

Is this related to CDC (change data capture) ?

Appending a log is way more efficient than making scattered random writes to a database. Storage systems are often optimize for sequential writes 

WAL takes advantage of this by batching and appending changes, resulting in 
faster writes, 
lower IO overhead
simplified recovery mechanisms


MongoDB uses a oplog (its WAL pattern)

walgit

---
# References 

https://www.architecture-weekly.com/p/the-write-ahead-log-a-foundation

https://www.postgresql.org/docs/current/wal-intro.html

https://github.com/tobi/walgit

https://selfhostedworld.com/software/walgit
