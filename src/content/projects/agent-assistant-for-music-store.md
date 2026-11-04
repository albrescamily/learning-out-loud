---
title: Agent assistant for music store
description: This project is a technical case for an AI Engineer position
status: done
stack:
  - Python
  - PostgreSQL
  - Pydantic
  - Agents
  - Embeddings
  - Local Inference
published: 2026-11-03T00:00:00.000Z
---
repository: https://github.com/albrescamily/assistant_agent

This project is a technical case study for an AI Engineer position. I’m building a virtual assistant for a fake music store called Empório da Música in Campo Grande. Her name is Melody, and her job is to help customers finding and buying products, checking on their orders, and handling other questions related to that.

Melody must follow a set of behavior policies pre defined, which shape how she talks to customers and what she can and can’t do. 

For the data, I’m using a few small CSV files that simulate the store’s database: customers, orders, products, promotions, and the relational tables that connect them. The dataset includes both transactional data and data with semantic information, so Melody has to work with structured records as well as more descriptive content.

This is the system first version I thought, not thinking in Guardrails, Evals, Tracing or Observability yet  

![](<../images/Drawing 2026-11-02 11.46.48.excalidraw.png>)

Here’s the architecture of my first prototype. I chose to run everything locally with Docker instead of in the cloud, because it makes the project easy to reproduce and lets me run the models on my own machine. Users interact with Melody through a CLI, which I find simpler than building a UI at this stage. Each conversation gets its own session ID, and session memory is stored in Redis. Everything is also kept in logs.

I’m implementing everything by hand instead of relying on ready-made agent frameworks. Melody runs on a small Qwen model for now, and she works as an orchestrator: based on what the user wants, she decides which tools to call. These tools are predefined in a tool registry in code.

One of those tools is a SQL Specialist, an agent used as a tool. Instead of writing SQL queries by hand, I think it works better to have a specialist agent with its own isolated context, since it can build more compositional queries for the transactional data. For the semantic side, I have an embedding service using Jina and a RAG setup on top of PostgreSQL with pgvector. That’s what handles requests like “I want a red guitar,” and it’s also used to look up store policies.

Finally, there’s a human escalation path. Depending on the return policy and on the user’s intent and tone, Melody can suggest forwarding the conversation to a human, for example when a customer seems really frustrated

That's my first prototype, It may change during the project progress. 

### Agent Loop and basic infrastructure

My first goal is to create a simple Agent Loop and define the basic system architecture where I can talk with the local LLM via terminal. Very simple

**commit**: [2a8ffc3db51e63ccd175b1820764207875a3cef3](https://github.com/albrescamily/assistant_agent/commit/2a8ffc3db51e63ccd175b1820764207875a3cef3)

### Defining the schemas 

The most difficult part of this process is to infer the data type from the csv. 

I created two files

`schema.sql ->` defining the tables and its foreign keys 
`load.sql ->` converting csv data into sql format using COPY. It need an existing table to insert via COPY

I created the database schemas and the PostgreSQL service in docker-compose file. 

I'm inserting the data via COPY mechanism 

**commit**: [789b7734eb9530bf1c560d7ffe2e79f5317da62a](https://github.com/albrescamily/assistant_agent/commit/789b7734eb9530bf1c560d7ffe2e79f5317da62a)

```sql
COPY promotions FROM '/data/promotions.csv' WITH (FORMAT csv, HEADER true);
```

![](<../images/Pasted image 20261102162114.png>)

### Implementing agent memory 

I decided to change Redis for a simple SQLite to implement the memory. 

To create the agent memory, first I need a way of simulate sessions with in the main.py

I will create the session ID for each CLI connection using UUID

**commit**: [4127b8ea132213c8a19966a291e56e9951af6c68](https://github.com/albrescamily/assistant_agent/commit/4127b8ea132213c8a19966a291e56e9951af6c68)

### Define the tool calling connection 

My next step is to define the tools registry, database connection, schemas and tool calling 

Connect the agent to the database with `psycopg[binary]`

write the tool and registry the tools 

I first thought creating the Registry tool as a SQLite file, but due to the complexity, I decided to just declare in code

I wrote a simple tool to test the connection. 

```
docker compose exec agent python -c "from tools.tools import get_orders; print(get_orders('lucas.mendes@jmail.com', 4))"
```

![](<../images/Pasted image 20261103105111.png>)


The model isn't calling the tool correctly 

![](<../images/Pasted image 20261103114909.png>)

### Tracing layer

I was thinking in a way to keep the structure outputs and tool calls best practices. I decided  to use Arize Phoenix locally for it.

Doing a simple test, my model hallucinate without consulting the database 
 
![](<../images/Pasted image 20261103113746.png>)

I need to add a guardrail here and a constraint 

I need to add an schema validation for structure output too

![](<../images/Pasted image 20261103113952.png>)

Notice that the two requests return a different message even if it was the same request. 

It would be interesting to add a cache to avoid recalculating the same prompt

**commit:** [088a9dbca325d2ccd6164f44f8db761595bc4873](https://github.com/albrescamily/assistant_agent/commit/088a9dbca325d2ccd6164f44f8db761595bc4873)

### Calling the tool executor 

We have to deal with the streaming output.

There is sensitive information appearing in the tracing 

![](<../images/Pasted image 20261103124128.png>)

The model started to hallucinate for Tom session due to the context window defined in my local model. So I will delete the memory. 

I can add a refresh or just retrieve the last 5 messages. 

```powershell
docker compose exec agent python -c "import sqlite3; c = sqlite3.connect('/app/memory_data/memory.db'); c.execute('DELETE FROM messages WHERE session_id = ?', ('6911f73e-8ee2-4891-9495-60f06b4d2fb5',)); c.commit()"

```

I'm testing the tool execution 

``` python
python main.py --user alice 
```

```
prompt: who are you 
```

```
prompt: quero consultar meu pedido 
```

```
prompt: `lucas.mendes@jmail.com` e 4 
```

![640](<../images/Pasted image 20261103125453.png>)

My trace is storing sensitive data. 

![](<../images/Pasted image 20261103132536.png>)

==I need Log Anonymization==

**commit**: [07305273aa21f1fdf3fdc6129103a2ac6b3af604](https://github.com/albrescamily/assistant_agent/commit/07305273aa21f1fdf3fdc6129103a2ac6b3af604)

### Schemas validation and System Boundaries 

![](<../images/Pasted image 20261103133452.png>)

I will define 3 schemas 

CLI -> server -> agent communication

agent -> LLM communication (Structure Output e Structure Input)

agent -> executor communication (Tool calling)

I added A schema validation for tool calling 

![](<../images/Pasted image 20261103142028.png>)


**commit**: [1944133d9a975432e9859d527470e1a5a00cb088](https://github.com/albrescamily/assistant_agent/commit/1944133d9a975432e9859d527470e1a5a00cb088)

### GPU Usage 

![](<../images/Pasted image 20261103140420.png>)

### RAG and Embeddings

Alright. I want to define RAG tools now. And for it I need to prepare the environment. 

I'm basically doing an agentic RAG 

Since I can run the BGE-M3 model inside my CPU, I will choose it instead of qwen3-embedding:8b

Path for the embedding model for QUERIES and PASSAGES use 

```
agent/src/clients/       
└── embedding.py      ← Embedding Client used for QUERIES

ingestion/clients/
└── embedding.py      ← Embedding Client used for PASSAGES

```

**commit**: [d94686609a40ed8edeb3940870c30bbe20402912](https://github.com/albrescamily/assistant_agent/commit/d94686609a40ed8edeb3940870c30bbe20402912)

I will create a OFFLINE INGESTION using docling to extract my Politicas_da_loja for a RAG system. 

![](<../images/Pasted image 20261103152248.png>)

**commit:** [4fe067b19018a86bce26434b8591620b95f0510c](https://github.com/albrescamily/assistant_agent/commit/4fe067b19018a86bce26434b8591620b95f0510c)

The products also have semantic information in description, because of that, I will add products to the vector database too. 

I will create a separated table for products called `product_embeddings`, where I use a foreign key to refer to the products table 

Because of that, I will have a hybrid search, since data like status, price WONT be embedded 

![](<../images/Pasted image 20261103181704.png>)

```sql
SELECT * FROM policy_chunks
```

I did a simple chunk approach and added the data to the database. No normalization  

The goal is to initialize the container with the data ready

I not thinking much about what will be embed, I just want something to work and them I will refine it 

Each new change to the database like inserting data and wanting to build the database with those data, I need to kill the previous container and volume 

```powershell
docker compose stop pg-database
docker compose rm -f pg-database
docker volume rm assistant_agent_pg_data
docker compose up -d --build pg-database
```

![](<../images/Pasted image 20261103183145.png>)


**commit**: [190c377c77aab7c2fcbbd762683a779b4f055621](https://github.com/albrescamily/assistant_agent/commit/190c377c77aab7c2fcbbd762683a779b4f055621)

**commit**: [aeb34b68aafd708c6ee51827746665b7e194699e](https://github.com/albrescamily/assistant_agent/commit/aeb34b68aafd708c6ee51827746665b7e194699e)


The answers are not standardized 

![](<../images/Pasted image 20261103185124.png>)


![640](<../images/Pasted image 20261103185137.png>)

### Handling Distributed tracing 

My system is doing 3 calls for 1 request 

![](<../images/Pasted image 20261103190118.png>)

I want to concatenate 1 conversation at a time 

![](<../images/Pasted image 20261103195152.png>)

,the first answer is **streamed**: each word goes to the customer as soon as the model writes it. So by the time you could check for “R$”, the invented price is **already on the customer’s screen**. You can’t take it back.

So the first answer has to be **complete before anything is sent**

I will only make a guarantee for the price 

![](<../images/Pasted image 20261103201657.png>)


There is other functionality i want to add and its chain tools

![](<../images/Pasted image 20261103205907.png>)

Quanto custa o Takamine GD20? E qual o status do meu pedido 4? Meu email é lucas.mendes@jmail.com



---
# References 

https://ai.engineer/topics/structured-outputs

https://zenvanriel.com/ai-engineer-blog/pydantic-ai-validation/

https://www.databricks.com/blog/rag-workflow

https://medium.com/@imrohitkushwaha2001/pgvector-explained-complete-guide-for-engineers-building-rag-ai-search-f6a68a150583

https://aws.amazon.com/pt/blogs/machine-learning/build-safe-and-responsible-generative-ai-applications-with-guardrails/








