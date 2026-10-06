---
title: whatwhale - nl2docker
description: Can a tiny model remember the Docker flags I keep forgetting?
status: active
stack:
  - "Docker\_"
  - "llama.cpp\_"
  - QLora
published: 2026-09-11T00:00:00.000Z
updated: 2026-10-01T00:00:00.000Z
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

https://www.kaggle.com/code/kamiria/fine-tune-qwen-instruct

![](<../images/Pasted image 20260907115356.png>)

lets use an agent to test the whatwhale 

I already have the GGUF file, how I should test the quality of the model? 

Next step is to create the CLI to call the model. 

# UPDATE 01-10-2026

### Creating the CLI 

The CLI was created using python. 

By default, I have a SYSTEM_PROMPT defined in the CLI 

```
`SYSTEM_PROMPT = (`

    `f"Translate the request into a single Docker CLI command for {platform.system()}. "`

    `"Reply with ONLY the command on one line, starting with 'docker'. No explanation, no markdown. "`

    `"If it cannot be done with one docker command, reply with 'ERROR: <short reason>'."`

`)`
```

### Creating the SandBox Evaluation 

I will set up the sandbox to test the model and CLI using a debian virtual machine provisioned by vagrant. 

```bash
vagrant init debian/bookworm64
```

I defined a Vagrant file to have docker engine and llama.cpp and also to start the llama-server with my model already working 

I'm passing the gguf file in my host as a sync model 

```bash
vagrant up
vagrant ssh
```

![588](<../images/Pasted image 20261001130416.png>)



![588](<../images/Pasted image 20261001130654.png>)


**Connection to the model** 

![587](<../images/Pasted image 20261001144653.png>)


My first abstraction for the evaluation environment was like this 

![560](<../images/Pasted image 20261001132051.png>)

The issue with this abstraction is that I don't have much control  in the evaluation process to analyze the results. 

Because of that, I will add a server-like process to work like an evaluator, it will receive a process, execute and them evaluate. 

The first issue I'm facing is how I going to pass the gguf model and this evaluation_server.py in my host to the sandbox 

> Do I want a completely isolated system? Or should I open a exception and mount some specifically folders to the sandbox ? 

Vagrant has an configuration called Provisioning that allows me to automatically  install software, alter configurations, and more on the machine as part of the `vagrant up` process in a isolated way. I cant use the tool called upload to upload the files from my host to the VM every time the vagrant is up

``` bash 
vagrant reload --provision
```

I will create the VagrantFile to copy the files using  provision and keep the sandbox totally isolated from my host without any sync folder. 

![560](<../images/Pasted image 20261002100255.png>)

Our VM  is a disposable sandbox, I want to keep canonical persistent test log on the host. My next steps will be creating a minimal logger and other minimal fixes

I found out something very interesting: **systemd**.

I never heard about it before!!


---
# References 

https://www.reddit.com/r/LocalLLaMA/comments/1vnl0um/trained_a_15b_to_write_shell_commands_so_id_stop/

https://github.com/ThorOdinson246/whatisit-nl2sh

https://github.com/ggml-org/llama.cpp/blob/master/docs/docker.md

https://unsloth.ai/docs/get-started/fine-tuning-llms-guide


https://huggingface.co/docs/peft/developer_guides/quantization


https://huggingface.co/docs/peft/main/conceptual_guides/lora
