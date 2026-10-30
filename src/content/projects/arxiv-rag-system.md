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
updated: 2026-10-30T00:00:00.000Z
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


In pgadmin we have 

![](<../images/Pasted image 20261021131106.png>)

There is a lot of issues with the current code.

I'm not thinking too much about the mechanisms to read the table Papers and how to write on it.

Who opens the connection? 
Who start the transaction? 
Do I have idempotency? 

I can parse the published data to catch only the year. 

Do I need a data change capture here for each time an metadata is changed ? Or a logger database? 

# UPDATE 30-10-2026

I will analyze the ingestion in other lens. I'm consulting the book Data Engineering Fundamentals and Designing Data Intensive Applications for it 

My goal its to get data from an **API** and ingest into my Database. 
We are pulling data from the source. Its a PULL pattern

There is a  lot of errors with the current code:  

1. There is a error with the batching processing mechanism. It always return the same data because the pagination always start with start=0.

We are dealing here with a **incremental loading pattern**

2. We also have a problem on how we deal with two difference versions of the same paper

3. The arxiv_id is not normalize and its adding the '/'

Instead of using the arxiv_id as primary key, I can create a true UUID for it ? 

How can I handle the duplication of the same paper due to different versions?


4. Schema is inconsistent 

I don't have a column to register when the data changed inside the system, neither a  column to handle the paper version 

To review the schema, we also need to think about the data type transformation 

5. Filters like LastUpdateDate not working

First, I will fix the schema adding new fields and changing somethings.

The parser needs to produce the new fields I will add 


```powershell
docker exec arxiv-rag-metadata-db-1 psql -U postgres -d arxiv_metadata -c "DROP TABLE papers"

uv run python -m arxiv_rag.db.metadata.init_db
```

[**Commit** c2e23a007a43b33a4e0859cdaca7fdad368a6cfd](https://github.com/albrescamily/arxiv-rag/commit/c2e23a007a43b33a4e0859cdaca7fdad368a6cfd)

Lets add a date window to retrieve the data from yesterday 

I will create a function called build_query 

[**commit** 4069ba5a2fbc28eca047a5a74e1451fd5de93cb4](https://github.com/albrescamily/arxiv-rag/commit/4069ba5a2fbc28eca047a5a74e1451fd5de93cb4)


I want to  calculate the adaptative batch size according to the total_results 

Since we are writing in batches, I want to optimize the API call to adapte the number of papers in one batch by calculating the total_results and our target value for it 


```python
def next_batch_size(remaining: int, page_limit: int = ARXIV_PAGE_LIMIT) -> int:
    return max(0, min(page_limit, remaining))
```

page_limit its the maximum number of papers we ask in one requisition

We are defining a start variable as a offset to handle the pagination

It always asks for full pages of page_limit papers, and only the last page asks for whatever is left.

We are handling the pagination loop for data ingestion

[**Commit** d4c8a73d02f2c4b6e9182552d3871e1fd2cbc02e ](https://github.com/albrescamily/arxiv-rag/commit/d4c8a73d02f2c4b6e9182552d3871e1fd2cbc02e)



---
# REFERENCES

https://info.arxiv.org/help/api/user-manual.html#arxiv-api-users-manual

https://info.arxiv.org/help/prep.html

