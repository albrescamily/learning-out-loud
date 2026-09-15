---
title: What I learned from building an Image Search System
description: Lessons learned from system and code design
published: 2026-09-15T00:00:00.000Z
---
Some people say we learn more from our mistakes… well, I can say I've learned a LOT by doing this project.

The goal was to create a system that receives an image or a text query and searches for matches in a database, similar to how Google Photos works. It seemed simple at first, but as I got into the mechanics, I kept running into problems that looked trivial on the surface and turned out to be much harder than I expected.

I will start by explaining the architecture, the design decisions I made, and why I made them. Also, I will analyze from a new perspective what I could have done better.

### Setup and Infrastructure

I use LocalStack, which emulates AWS services locally. In this project, I use it mainly to simulate S3 object storage. I also run Qdrant as the vector database. Both LocalStack and Qdrant run in Docker.

For this prototype, everything runs on the same machine, so I access the services locally through their network APIs. I use Boto3 to communicate with LocalStack through the S3-compatible API, and I use the Qdrant Python client to communicate with Qdrant through its API. 

I didn’t focus much on reproducing a production network topology. Even though I wanted to simulate a production-like system at a small scale, I kept the infrastructure local instead of deploying the services across multiple machines to simulate real systems.



![](<../images/search-system-design.drawio 1.png>)

<center>Fig 1: Architectural diagram</center>

### Input Path

For the storage API, I created several routes to manage objects: upload, update, delete, and get/list operations. The upload endpoint is the main entry point for the ingestion pipeline. When a user uploads an image, the API layer orchestrates the storage, embedding, and indexing steps as one unit.

The upload endpoint calls the embedding service and then the indexing service.

```python
@app.post("/upload")
async def upload_image(file: UploadFile = File(...)):
    bucket, key = upload_to_s3(file)
    embedding = embed_image_from_s3(bucket, key)
    index_image(bucket, key, embedding)

    return {"message": "Uploaded successfully!"}
```

The problem here is that the upload process is linear, and the upload route acts like an orchestrator. If a fault happens during one of these steps, it can cause inconsistencies between S3 and Qdrant. There is no guarantee that the whole upload flow will run without problems or that every service will always be available.

It also creates a scalability problem because the request depends on multiple operations being completed before returning a response. If one of these operations becomes slow or gets stuck, the request stays open for longer, consumes resources, and can increase the load on the system as more requests arrive.

This is also fundamentally an **idempotency problem**. The system has no defined behavior for retries, duplicate uploads, duplicate IDs, or a step that hangs indefinitely. If a client retries after a timeout, does it create a duplicate object? Does it overwrite the original? Right now, the answer is undefined.

There's another issue that's very important to address: deletions are not propagated safely.

If I want to delete an image, how will this operation be replicated so the corresponding vector is also removed from Qdrant? There is no guarantee.

The frontend should not be responsible for coordinating a delete operation across S3 and Qdrant. Ideally, it should only send something like `DELETE /images/{id}`, and the backend should handle how this change is propagated across the system.

Since S3 and Qdrant are two independent systems, there is no shared transaction between these operations. If the image is deleted from S3 but the Qdrant operation fails, the vector can remain in the database even though the original object no longer exists.

This is called the **dual-write problem**. As the DDIA book discusses, writing related data to heterogeneous systems becomes difficult because we need some way to keep those changes consistent.

One possible direction would be to change the architecture and make the propagation of these changes event-driven.

There are a few approaches that could be considered:

- **Two-Phase Commit (2PC):** The issue with using two-phase commit here is that neither S3 nor Qdrant exposes the kind of distributed transaction mechanism we would need to coordinate both writes, so this approach is not really practical for this system.
    
- **SAGA pattern:** A Saga could model the workflow as a sequence of operations and use compensating actions when something fails. This can reduce some coupling between services, but it also introduces eventual consistency and does not automatically solve reliable event publishing.
    
- **Transactional Outbox pattern:** Probably the approach I like the most. Instead of directly trying to update every external system inside the same request, we can write the state change and an event into the same PostgreSQL transaction. Then, another process can publish or consume those events and update S3, Qdrant, or other services.
    

I really like the idea of the Transactional Outbox pattern, so I would probably choose this approach to address the consistency problem.

The idea of change data capture is also very interesting. PostgreSQL could act as the source of truth, while an outbox table records events that still need to be propagated. A worker or CDC mechanism could then read those changes and update the other systems.

### Query Path

When the query enters the system, it is sent to the embedding service inside the `query_text` route:

```python
@app.post("/query_text")
async def input_query_text(query: str):
    query_embed = embed_text_query(query)
    results = ann_search(query_embed)

    images = [
        {
            "key": payload["key"],
            "url": s3_client.generate_presigned_url(
                "get_object",
                Params={
                    "Bucket": payload["bucket"],
                    "Key": payload["key"],
                },
                ExpiresIn=3600,
            ),
        }
        for payload in results
    ]

    return {"images": images}
```

I use the same image ID as the identifier for both the S3 object and the Qdrant vector. This gives me a direct mapping between the vector search result and the original image.

Using the same ID is useful, but it does not guarantee that both systems will stay consistent.

If the two stores get out of sync because some operation was not propagated correctly, a query can return a vector that has no corresponding object in S3. The endpoint also has no way to detect or recover from this situation.

The `generate_presigned_url` call does not check if the object actually exists. It just creates a valid URL for that object key. So the frontend can receive the URL, try to load the image, and fail because the object is not there.

Well, there are a lot of issues with my current project. I wanted to point out the most relevant ones I discovered, so there may be other problems I still don't know about.

It was really fun building this project and interesting investigating the issues it has. Next time, I may refactor this project to build as event-driven to address those pain points

### Bonus

Besides all the issues I addressed above, I also started thinking about the security side and how to keep the system secure.

One of the things that came to my mind was user image metadata. Sometimes, images have sensitive information in their metadata, for example geolocation, that can put users at risk and should not be visible to other users. So, when an image enters the system, we need a process that removes this sensitive metadata from the version of the image that will be displayed. 

At the same time, I may still want to preserve the original image and its metadata in case the owner wants to download it again. The original version could stay private and accessible only to the owner, while the processed version would have sensitive metadata removed and would be used for search results and display.

Thanks for reading these lessons learned.

-- Cami
