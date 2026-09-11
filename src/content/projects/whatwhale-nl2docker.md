---
title: whatwhale - nl2docker
description: CLI LLM-based to translate NL to docker commands
status: active
stack: []
published: 2026-09-11T00:00:00.000Z
---


Building a tiny specialized LLM for docker commands, called whatwhale. Sometimes I forget basic commands and flags for docker so I thought It would be cool to have a small llm to automatically tell me the right command. 

Inspired by whatisit https://github.com/ThorOdinson246/whatisit-nl2sh, I thought It would be a good idea to do the same but for docker commands.

Our main objective is to write a CLI llm-based for docker commands. I want to fine-tuning a code specific LLM to specific docker commands. 

**Qwen2.5-Coder-1.5B-Instruct** 
**Qwen2.5-Coder-7B-Instruct**

For the inference server, I will use llama.cpp 


==I'm going to use Docker and add a llama server there. Im going to use== CPU to process the inference instead of GPU, since to use GPU in docker, we need to configure the CUDA and use nvidia toolkits

This is my first prototype of the idea 

![](<../images/Pasted image 20260831140252.png>)


Lets start by fine tuning the model using LORA and command like docker
How to write the CLI

## Fine tuning the model 

Fine tuning PEFT LoRa

https://huggingface.co/datasets/MattCoddity/dockerNLcommands

We will have to create our own benchmark 

 InterCode-ALFA

I'm going to use a 3050RTX 6GB, I will need to approach the problem with epoch and batch size to keep the memory safe and stable 

~~I want to fine tune the model in local to be able to work with CUDA tools and play directly with my GPU.~~ 

I will do a executation-based evaluation using sandbox enviroments and safe guardrils, because its a code generated reponse and surface metrics dont work.

**A causal language model is a type of machine learning model that predicts the next token or word in a sequence based strictly on the words that came before it** . Thats why we use AutoModelForCausalLM 

Going to use Kaggle 

![](<../images/Pasted image 20260907115356.png>)

lets use an agent to test the Whatwhale 

I already have the GGUF file, how I should test the quality of the model? 

Next step is to create the CLI to call the model. 

### Creating the CLI 





---
# References 

https://www.reddit.com/r/LocalLLaMA/comments/1vnl0um/trained_a_15b_to_write_shell_commands_so_id_stop/

https://github.com/ThorOdinson246/whatisit-nl2sh

https://github.com/ggml-org/llama.cpp/blob/master/docs/docker.md

https://unsloth.ai/docs/get-started/fine-tuning-llms-guide


https://huggingface.co/docs/peft/developer_guides/quantization


https://huggingface.co/docs/peft/main/conceptual_guides/lora
