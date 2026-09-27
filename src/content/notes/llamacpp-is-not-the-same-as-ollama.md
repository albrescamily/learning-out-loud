---
title: llama.cpp is not the same as ollama
published: 2026-08-31T00:00:00.000Z
---
Just found out that Ollama and llama.cpp are not the same thing! 

Ollama uses llama.cpp as part of its inference backend, like a super wrapper with other funcionalities like runtime abstractions. Due to this, ollama is way slower than llama.cpp

If we want to run our own fine-tuned GGUF model directly with llama.cpp, we need a standalone llama.cpp runtime, such as `llama-server`. We can either download the pre-built binaries or build llama.cpp from source.
