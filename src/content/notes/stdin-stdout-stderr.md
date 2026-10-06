---
title: 'stdin, stdout, stderr'
published: 2026-10-06T00:00:00.000Z
---
They are the standard streams for I/O in UNIX/Linux systems.

They have file descriptors 
**0 - standard input**
**1 - standard output**
**2 -  standard error**

A file descriptor is ==a unique, non-negative integer used by an operating system kernel to identify and track an open file or input/output resource==, such as a pipe or network socket

**?? - Alright, why they have file descriptors? and why they are called file descriptors?**
Because a **process** needs a simple way to refer to resources it has opened, and we can represent those resources as integers. Basically, its a simple way to communicate with the kernel without the kernel  knowing about the actual resource. 

Main idea: The descriptors are basically the process's **handles to I/O resources managed by the kernel**.

Those integers we call file descriptors. They are represented by **fd**

The name **file descriptor** comes from Unix's design where many I/O resources are accessed using a file-like interface. A **fd** can refer to a regular file, terminal, pipe, socket or a device. 

Every process has a list of file descriptors. 

```
Process A

fd 0 → terminal input
fd 1 → terminal output
fd 2 → terminal errors
fd 3 → file.txt
fd 4 → socket
```
```
Process B

fd 0 → terminal input
fd 1 → terminal output
fd 2 → terminal errors
fd 3 → database.sock
```

So `fd 3` in Process A and `fd 3` in Process B can refer to completely different things.

The file descriptor number is only meaningful **inside that process**.

The following script will print all file descriptors of all processes.

```bash
#! /bin/bash

find /proc -maxdepth 1 -type d -regex '/proc/[0-9]+' -printf '%P\n' |
  {
    while read -r pid; do
      if -d /proc/$pid; then
        printf '%d:' "$pid"
        find /proc/"$pid"/fd -type l -printf ' %P' 2>/dev/null
        printf '\n'
      fi
    done
  }
```

**what the heck is a stream ?** 

A stream is just a flow of data that a program can read from or write to over time. In other words: A stream is a channel through which data flows between a program and something else.

A **file descriptor belongs to an OS-level I/O resource** managed by the kernel. A **stream is a higher-level idea: a flow of data**.

```
stdout stream
     ↓
file descriptor 1
     ↓
kernel
     ↓
terminal
```


Stdout and stderr are separate so the system can distinguish normal outputs from problems.

connects the cat stdout with the grep stdin through pipe

```bash
cat file.txt | grep "docker"
```

we are changing the python stdout before starting it 
```python
python script.py > output.txt
```

Redirect the file descriptor 2 to errors.txt

```bash
2 > errors.txt
```


When we say a process **“inherits” `stdin`, `stdout`, and `stderr`**, we mean that when one process starts another process, the new process normally begins with access to the **same open file descriptors** as its parent.


```
Terminal
   ↓
 bash
   ↓
 python
```

The parent process gives the child process its initial **stdin**, **stdout**, and **stderr** connections.
