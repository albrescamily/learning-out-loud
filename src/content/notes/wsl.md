---
title: 'WSL '
published: 2026-10-06T00:00:00.000Z
---
WSL2 as Linux running inside a lightweight virtual machine managed automatically by Windows

Because it is still a virtual machine, its lifecycle is separate from the terminal we use to access it.

Closing the WSL terminal does **not** necessarily stop WSL. The terminal is only one process running inside the Linux environment. If other processes or services are still running, the WSL distribution will remain active.

When there are no more processes keeping the distribution active, Windows eventually shuts down the idle WSL environment by itself.

we can see the WSL VMs running using the following command: 

``` bash
wsl --list --running
```

If we want to manually kill the WSL VM, we can use 

```bash
wsl --shutdown
```
