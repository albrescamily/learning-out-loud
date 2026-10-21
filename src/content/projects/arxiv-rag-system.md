---
title: ArXiv RAG System
description: Designing and implement a RAG system for ArXiv papers with their public API
status: active
stack:
  - Python
  - SQL
  - ETL
  - APIs
  - System Design
  - PostGRESQL
published: 2026-10-21T00:00:00.000Z
---
Repository: https://github.com/albrescamily/arxiv-rag

This project is very simple. I want to build an ETL pipeline that retrieves research papers from the public arXiv API and makes them accessible through a semantic search system.

I'll use Prefect to orchestrate the data ingestion pipeline, PostgreSQL to store paper metadata, Pgvector to store embeddings and Jina AI to  generate embeddings for semantic search.

I first tried to use Airflow for this project, but due to the complexity and the learning curve, I decided to move to a simpler tool

The goal is to search for research papers using NL queries. We will use Jina to convert each query and passage into an embedding vector that we will compared against the stored paper embedding to retrieve the most relevant results based on a ranking algorithm. 

The first diagram is this:



![](<../images/Pasted image 20260925111813.png>)

I will first implement the metadata pipeline and them move to the embedding part

 **API** 

According with the API documentation, the query method has the following parameters:

```
http://export.arxiv.org/api/{method_name}?{parameters}
```

|   |   |   |   |   |
|---|---|---|---|---|
|query|||||
||**parameters**|**type**|**defaults**|**required**|
||`search_query`|string|None|No|
||`id_list`|comma-delimited string|None|No|
||`start`|int|0|No|
||`max_results`|int|10|No|

First, lets check the schema of the API response with Postman

```
https://export.arxiv.org/api/query?search_query=all:machine_learning&start=0&max_results=1
```

![](<../images/Pasted image 20261021113356.png>)

It's an XML format.

The ArXiv API uses a pagination algorithm 

That's why they use OpenSearch. It tells us how the result is paginated. Its like a metadata for the results. 

```
<opensearch:itemsPerPage>
<opensearch:totalResults>
<opensearch:startIndex>
```


The API documentation also has the explanation for ArXiv Metadata  

![640](<../images/Pasted image 20261021114613.png>)

**Creating the ArXiv Client - Consuming the API** 

Let's parse the XML entry and fetch the page

parse_entry() its parsing the entry feed to a dict format 

fetch_page() it's handling the request 

 **Define the infrastructure** 

I'm using docker compose to up the containers as services locally 

PostgreSQL
pgvector
pgadmin 

![](<../images/Pasted image 20261021120828.png>)

Creating the database Schema for Metadata DB. I will follow the API entry format 

![](<../images/Pasted image 20261021125020.png>)

Let's initialize our table Papers 

```
uv run python -m arxiv_rag.db.metadata.init_db
```


Lets create the Prefect Pipeline 

We are defining two tasks

fetch_page() -> its calling the function we are using to handle the ArXiv API 

load_metadata() -> Its calling the function insert_papers() from db connection

The rest of the pipeline defined in Ingestion Flow. It is handling the loop and the processing 

```
uv run python -m arxiv_rag.flows.ingest_arxiv
```

![](<../images/Pasted image 20261021130700.png>)


First we are passing the following parameters 

```python
 query = (
        "cat:cs.AI OR "
        "cat:cs.LG OR "
        "cat:cs.CL"
    ) 
    
   ingestion_flow(
        search_query=query,
        batch_size=5,
        max_papers=20,
    ) 
    
```

In pgadmin we have 

![](<../images/Pasted image 20261021131106.png>)

There is a lot of issues with the current code.

I'm not thinking too much about the mechanisms to read the table Papers and how to write on it.

Who opens the connection? 
Who start the transaction? 
Do I have idempotency? 

I can parse the published data to catch only the year. 

Do I need a data change capture here for each time an metadata is changed ? Or a logger database? 









---
# REFERENCES

https://info.arxiv.org/help/api/user-manual.html#arxiv-api-users-manual

https://info.arxiv.org/help/prep.html

