# MongoDB → Elasticsearch: sync it, then search it

Your product catalog lives in MongoDB. Let's make it searchable in Elasticsearch.

In this lab, you'll load 20 fictional outdoor products, sync them into **Elasticsearch Serverless**, and run searches in **Kibana Dev Tools**. Then you'll change a price and sync again. Rain jackets included; actual rain optional.

**Validated on October 29, 2026:** Ubuntu 22.04.5 LTS on x86_64 EC2, Docker Engine 29.9.2, and Docker Compose 5.6.1, using MongoDB `8.0` and Elastic connector `9.5.5` with Elasticsearch Serverless. Installation, initial sync, searches, aggregations, and update/resync were verified. Stop/resume and destructive cleanup commands have not yet been tested in this walkthrough. The MongoDB tag follows the 8.0 image line; it is not pinned to a patch or digest.

## What you'll run

MongoDB and a self-managed Elastic connector run in Docker on the same Linux host. The connector reads MongoDB over their Docker network and sends documents to Elasticsearch Serverless over HTTPS. You search the indexed copy through your browser.

MongoDB has no published host port. **Do not open port 27017 in your EC2 security group.** The database connection inside this single-host lab uses no TLS; use encrypted database connections for production deployments.

Syncing is one-way: MongoDB → Elasticsearch. This lab uses on-demand full syncs, not continuous replication. Semantic and hybrid search require additional configuration and are outside this first walkthrough.

## Before you start

- A fresh Ubuntu 22.04 x86_64 machine with `sudo`. For this small lab, start with 4 GB RAM and 20 GB disk; these are suggested lab resources, not benchmarked minimums.
- For EC2: SSH access restricted to your IP. Allow outbound HTTPS for downloads and Elasticsearch. AWS hosting charges are separate from the Elastic trial.
- An **Elasticsearch Serverless project**. You can [start a free 14-day Elastic Cloud trial](https://cloud.elastic.co/registration). Create an Elasticsearch project, open it, and keep its Elasticsearch endpoint handy.
- A user who can create an index, connector, and API key in that project. Use your own dedicated lab project; connector-management permissions cover more than this one connector.

All terminal commands below run **on the Ubuntu host**, inside `elastic-samples/search/mongodb` unless noted otherwise. Requests marked **Dev Tools** run in the browser, not Bash.

## 1. Install Docker and Compose

**Ubuntu terminal.** If Docker already exists, first check `sudo docker version` and `sudo docker compose version`. Use Docker's linked installation guide to resolve conflicting installations; the commands below assume a fresh host.

Install the prerequisites and add Docker's package repository:

```bash
sudo apt-get update
sudo apt-get install -y ca-certificates curl git openssl vim
sudo install -m 0755 -d /etc/apt/keyrings
sudo curl -fsSL https://download.docker.com/linux/ubuntu/gpg -o /etc/apt/keyrings/docker.asc
sudo chmod a+r /etc/apt/keyrings/docker.asc
```

```bash
sudo tee /etc/apt/sources.list.d/docker.sources >/dev/null <<EOF
Types: deb
URIs: https://download.docker.com/linux/ubuntu
Suites: jammy
Components: stable
Architectures: $(dpkg --print-architecture)
Signed-By: /etc/apt/keyrings/docker.asc
EOF
```

Install and verify Docker Engine and the Compose plugin:

```bash
sudo apt-get update
sudo apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
sudo systemctl enable --now docker
sudo docker run --rm hello-world
sudo docker version
sudo docker compose version
```

The test should print a greeting, and both version commands should succeed. We use `sudo docker` throughout, so no Docker group changes or logout are needed.

## 2. Get the sample and set passwords

**Ubuntu terminal:**

```bash
cd ~
git clone https://github.com/VictorHarrison/elastic-samples.git
cd elastic-samples/search/mongodb
cp .env.example .env
chmod 600 .env
openssl rand -hex 24
openssl rand -hex 24
vi .env
```

Paste the first random value into `MONGO_ADMIN_PASSWORD` and the second into `MONGO_SYNC_PASSWORD`. Use different values. In `vi`, press **i** to edit. Press **Esc**, type **:wq**, and press **Enter** to save and exit.

The `.env` file is local and ignored by Git. Do not share it, screenshots of it, or rendered Compose configuration containing its values.

## 3. Start MongoDB

**Ubuntu terminal.** Check configuration without printing secrets, then start only MongoDB:

```bash
sudo docker compose config --quiet
sudo docker compose up -d --wait --wait-timeout 180 mongodb
sudo docker compose ps
sudo docker compose exec -T mongodb mongosh --quiet /lab/scripts/check-mongodb.js
```

Expected: MongoDB is healthy, `Products: 20 (expected 20)`, and product `p001` has price `119.99`.

On its first start, MongoDB creates the catalog and a dedicated `elastic_sync` user with read access to the `outdoor` database. Product prices are fictional and in USD.

Initialization runs only for an empty data volume. Restarting won't reload the catalog or change existing database passwords.

## 4. Prepare Elasticsearch

**Browser → your Serverless project → Dev Tools → Console.** Find Dev Tools using the global search if needed.

Open [dev-tools/setup.http](dev-tools/setup.http), copy its requests into Console, and run them **one at a time**:

1. Create `search-outdoor-products` with explicit field types. Text fields support full-text search; `category` is a keyword for exact filters and aggregations.
2. Create the self-managed connector `mongodb-outdoor-demo`.
3. Create its API key. Save the returned **`id`** and **`encoded`** values privately before leaving the response. The key expires in 14 days; after expiry, syncing requires a replacement key. Existing indexed documents remain searchable.
4. Replace the placeholder in the last request with the key's **`id`**, then run it to associate the key with the connector.

Each request should succeed. Stop and resolve errors before continuing. Don't run the API-key creation request repeatedly: each execution creates another key. Keep edited requests containing credentials out of the repository.

## 5. Start the connector

**Ubuntu terminal:**

```bash
cp connectors-config/config.yml.example connectors-config/config.yml
chmod 600 connectors-config/config.yml
vi connectors-config/config.yml
```

Replace the two placeholders:

| Setting | Value |
|---|---|
| `elasticsearch.host` | Your project's HTTPS Elasticsearch endpoint, not its Kibana URL or Cloud ID. |
| `elasticsearch.api_key` | The **`encoded`** value from the API-key response. |

In `vi`, save with **Esc**, **:wq**, **Enter**. Keep the fixed connector ID and `service_type: mongodb`. If your project's connection details offer multiple endpoints, use the Elasticsearch one.

Start the connector profile and inspect its logs:

```bash
sudo docker compose --profile sync up -d --wait --wait-timeout 180
sudo docker compose --profile sync ps
sudo docker compose logs --tail=80 connector
```

The connector should check in without authentication or permission errors. `--wait` confirms container startup; it does not prove the connector can sync. The next steps verify that.

**Browser:** search for **Connectors** using the project's global search and open **Outdoor catalog from MongoDB**. Refresh after the service checks in. Configure the MongoDB source using these values; UI labels may vary slightly:

| Field | Value |
|---|---|
| Host / server hostname | `mongodb://mongodb:27017/?authSource=admin` |
| Username | `elastic_sync` |
| Password | Your `MONGO_SYNC_PASSWORD` from `.env` |
| Database | `outdoor` |
| Collection | `products` |
| Direct connection | Enabled |
| SSL/TLS | Disabled for this private, single-host lab |

Complete the source configuration and continue to **Connect Index**. Select the existing `search-outdoor-products` index. Reuse the API key already configured; skip **New API key**, then click **Save and sync**. The hostname `mongodb` is the Docker service name; it resolves inside the connector container. Don't replace it with your EC2 public IP or `localhost`.

## 6. Sync, then search

**Browser:** **Save and sync** queues the first full content sync. Wait for it to finish successfully; a pending or running job is not finished yet. It may take about a minute for the connector to pick up the job. Refresh the page rather than queueing another sync.

**Dev Tools:**

```http
GET search-outdoor-products/_count
```

Expected: `"count": 20`. If the sync just finished, allow a few seconds for search visibility and retry.

Now try [dev-tools/queries.http](dev-tools/queries.http), one request at a time:

- Search for **waterproof jacket**, with extra weight given to product names. Two products match: RainReady ranks first, while Breeze Windbreaker also matches because its description says "not waterproof." Keyword matching does not interpret that negation. For a real catalog, represent requirements such as waterproofing with structured attributes and exact filters.
- Find jackets in stock for **under $100**. Initially, two products qualify.
- Count products by category and calculate average prices. Each of the five categories contains four products.

Try changing the words, price limit, or category. You're querying Elasticsearch's indexed copy; these searches do not query MongoDB directly.

## 7. Change a price and sync again

**Ubuntu terminal:** put the RainReady jacket on sale:

```bash
sudo docker compose exec -T mongodb mongosh --quiet /lab/scripts/update-product.js
```

Expected: product `p001` now costs `89.99` in MongoDB. The script uses the lab administrator; the connector's user stays read-only.

**Browser:** trigger another full content sync and wait for success.

**Dev Tools:** run query 5 in `queries.http`, then repeat the under-$100 query. Expected: `p001` costs `89.99`, three jackets qualify, and the total document count remains 20.

That is the full loop: **write in MongoDB → sync → search in Elasticsearch.**

## Troubleshooting

| Symptom | What to check |
|---|---|
| `docker compose` is unavailable | Verify that `docker-compose-plugin` is installed. Use `docker compose`, with a space. |
| MongoDB is unhealthy or fewer than 20 products exist | Run `sudo docker compose logs --tail=100 mongodb`. Check for initialization errors or an old data volume. |
| Initialization failed, or changing `.env` did not change the password | Existing volumes retain users and data. For this disposable lab, follow the volume-reset instructions below, then start again from step 3. |
| Connector exits or reports YAML errors | Check `config.yml` indentation and placeholders. Keep endpoint and API-key values inside quotes. |
| Connector cannot read `config.yml` | Keep the example's image and default user settings. Check file ownership and logs; don't make credential files world-readable. |
| `401` or `403` from Elasticsearch | Verify the endpoint, key's `encoded` value, expiration, and role permissions. If replacing the key, update both its ID on the connector and its encoded value in `config.yml`. |
| MongoDB connection fails | Use hostname `mongodb`, database `outdoor`, user `elastic_sync`, and `authSource=admin`. Verify MongoDB is healthy. |
| Sync is pending | Verify the connector is running and its ID matches `mongodb-outdoor-demo`. Check logs for authentication or configuration errors. |
| Elasticsearch has zero documents | Check the sync job's error details and source settings. Wait for a successful full sync before counting. |
| Existing-index error in setup | Check whether you already completed that request. Don't delete an index unless you intend to discard its data. |

After changing `config.yml`, restart the connector:

```bash
sudo docker compose --profile sync restart connector
sudo docker compose logs --tail=80 connector
```

Redact credentials before sharing logs. For an API error, keep the HTTP status and error message so it can be diagnosed.

## Stop, resume, or clean up

**Pause** both services while preserving the catalog:

```bash
sudo docker compose --profile sync stop
```

**Resume:**

```bash
sudo docker compose --profile sync up -d --wait --wait-timeout 180
```

**Remove containers and the network**, keeping MongoDB's data volume:

```bash
sudo docker compose --profile sync down
```

**Delete the MongoDB data too.** This permanently removes this lab's catalog and users. Use this to reset failed initialization; the next start recreates them from `.env` and the sample files:

```bash
sudo docker compose --profile sync down --volumes
```

Docker cleanup does not remove cloud resources. To finish the lab:

1. Stop the connector before deleting its cloud configuration.
2. In the project, delete the sample connector and `search-outdoor-products` index if keeping the project for other work. Invalidate the sample API key under API Keys.
3. Alternatively, delete the dedicated Serverless project if you no longer need it. Check your trial/subscription status separately.
4. Terminate the EC2 instance when finished and check for any retained EBS volumes or other billable AWS resources.
5. Remove local credential files if you no longer need them: `rm .env connectors-config/config.yml`.

## Where next?

What if a shopper searches for **"something to keep me dry on a rainy hike"**? A follow-up can add semantic and hybrid search using the same catalog. This first lab supplies the data and syncing foundation.

## References

- [Install Docker Engine on Ubuntu](https://docs.docker.com/engine/install/ubuntu/)
- [Elastic Cloud trial](https://www.elastic.co/docs/get-started/evaluate-elastic)
- [Self-managed connectors and Serverless prerequisites](https://www.elastic.co/docs/reference/search-connectors/self-managed-connectors)
- [Run the connector service in Docker](https://www.elastic.co/docs/reference/search-connectors/es-connectors-run-from-docker)
- [MongoDB connector settings and behavior](https://www.elastic.co/docs/reference/search-connectors/es-connectors-mongodb)
- [Create a Serverless connector](https://www.elastic.co/docs/api/doc/elasticsearch-serverless/operation/operation-connector-put)
- [Associate a connector API key](https://www.elastic.co/docs/api/doc/elasticsearch-serverless/operation/operation-connector-update-api-key-id)

This is a learning lab. The product catalog is fictional, and the example isn't a production deployment template.
