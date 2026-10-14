---
title: Literature Puzzle with LLMs
description: Building a program to solve Cain's Jawbone Puzzle
status: active
stack:
  - NLP
  - LLMs
  - Ontologies
  - Statistics
published: 2026-10-14T00:00:00.000Z
---
For months, I've been thinking about how to approach and solve the Cain's Jawbone puzzle using LLMs.

Honestly, this is a problem that have been driving me crazy cause I really wanted to solve this using LLMs and be able to evaluate the results and the confidence score.

But first, For those who don't know about Cain's Jawbone puzzle, let me represent them to you: 

_Cain’s Jawbone_ is a literary puzzle made up of 100 pages in a random order. The challenge is to put them back in the correct sequence and solve six murders by identifying the victims and their killers.

What makes it difficult is that the story is full of hidden clues, riddles, wordplay, and literary references. Readers need to connect information from different pages to figure out the correct order and understand what happened.

We have two problems with this puzzle:

The first one is to find the right sequence from a unsorted order. We cant solve using permutation because its a factorial 100!

The second challenge is to identify the killers and their victims by solving the riddles and uncovering the hidden clues scattered throughout the pages.

See?? Its very interesting. 

Since the pages are out of order, feeding all of them into an LLM with a small context window could lead to hallucinations and wouldn't guarantee a correct solution. Of course, with the right prompting techniques, I could probably get a frontier model with a huge context window to solve the puzzle. But where's the fun in that?

So, my first prototype of solution is something like this: 

**Extraction** -> Extracts information 
events, temporal evidences, characters, enigms. Ontologies. 

**Symbolic Layer** -> Creates knowledge and hypotheses 

Adds narrator voice
Identify the temporal state along the puzzle to identify the page order

Generates a observational graph  from information's extract with algebra of allen. 

**One important thing about working with literature data is the identity of the narrator.** 

Passes hypnosis and evidences to the inference layer 

**Inference Layer**

Test hypotheses, validate and return to symbolic layer

**Global Solution** 

Page sequence and ranking of killers and why 


# Extraction 

Im going to use LangExtract from Google using a local ollama model. 

Technically, my ontology is passed my few shot and inferenced by the model an using to extract the data

Here I'm not extracting relations, just the information. 

![](<../images/Pasted image 20261013150228.png>)

Recognizing references and puns requires real-world knowledge, and that is where a 9B model most often stumbles. People, events, time, and narrator cues are found within the text itself, and the model handles that well.


While I was doing my experiments, I faced an issue with the performance of my model.

I was using `qwen3.5:9b` and its too big to fit inside my GPU  (RTX 3050, 6 GB VRAM), so half of the model was being loaded in CPU 


So I decided to change to `qwen3.5:4b-q4_K_M` to be able to use my GPU completely 

![](<../images/Pasted image 20261013182221.png>)
