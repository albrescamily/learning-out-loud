---
title: Among-ASCII
description: What if LLM-based agents played Among Us in a traditional roguelike format?
status: active
stack:
  - Python
published: 2026-10-03T00:00:00.000Z
updated: 2026-10-03T00:00:00.000Z
---
Repository: https://github.com/albrescamily/among-ascii

Since Among us is by FAR my favorite game, I thought "What if I make LLMs play Among Us against each other?". Its a perfect environment for LLM-based agents! 

Its a social deductive game that we have to act and deduce who the impostor is based on observations and partial information. 

But I faced I'm issue on this idea, How would I clone the Among Us game to make agents play against each other locally and evaluate their behaviors? 

I can't copy the original game by myself since this is not on the scope of my project, and I tried to use replicas I found on GitHub made by other users, but the messy code made the learning curve too high to keep going on this approach.

To give a context, after some weeks trying to adventure myself into traditional roguelikes games, and questioning myself If I was too dumb to play them (I honestly gave up on cogmind and Dungeon Crawl), I started researching about RL and game gymnasiums.

After I found out about NetHack Learning Environment, I came with a brilliant idea! 

What If I ask ChatGPT Astra to recreate the Skeld map in ASCII?

![](<../images/Pasted image 20261002230104.png>)

![](<../images/Pasted image 20261003000506.png>)


Since the scope of this project is to build the agents from scratch, I decided not to spend too much time manually creating the environment and used AI to help generate its initial structure.

The environment is designed to simulate the traditional _Among Us_ map and its main game mechanics. I added vents and sabotage systems to support impostor behavior, as well as tasks that crewmates can complete throughout the game.

The main goal is not to perfectly recreate _Among Us_, but to provide a sufficiently rich environment for experimenting with agent behavior, interaction, decision-making, and coordination.











