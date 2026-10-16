# Queuetopia: a small job queue for Python

Queuetopia runs background jobs from a Postgres table. It needs no broker. Workers poll the table, lock one row with `SELECT ... FOR UPDATE SKIP LOCKED`, run the job and mark it done.

## Installation

Install the package from PyPI:

```sh
pip install queuetopia
```

Queuetopia supports Python 3.9 and later, and Postgres 12 and later. Create the jobs table with the bundled migration:

```sh
queuetopia migrate --database-url postgres://localhost/app
```

The migration creates one table, `queuetopia_jobs`, and two indexes. It is safe to run more than once.

## Defining jobs

A job is a plain function with the `@job` decorator. Arguments must be JSON-serialisable, because they are stored in a `jsonb` column.

```python
from queuetopia import job

@job(queue="email", retries=3)
def send_welcome_email(user_id: int) -> None:
    user = User.get(user_id)
    mailer.send(user.email, template="welcome")
```

To enqueue a job, call `.delay()` with the same arguments:

```python
send_welcome_email.delay(user_id=42)
```

`.delay()` inserts one row and returns the job id. Inside a database transaction, the job becomes visible to workers only after the transaction commits. This avoids the classic race where a worker picks up a job for a row that does not exist yet.

## Running workers

Start one worker process per CPU core:

```sh
queuetopia worker --queues email,reports --concurrency 4
```

Each worker polls every 500 ms by default. Set `--poll-interval` to change this. Workers also listen on a Postgres `NOTIFY` channel, so new jobs usually start within a few milliseconds.

Stop a worker with SIGTERM. The worker finishes its current jobs, then exits. A second SIGTERM stops it at once, and the unfinished jobs return to the queue after their lock timeout.

## Retries and failures

When a job raises an exception, Queuetopia records the traceback and schedules a retry. The delay grows exponentially: 10 seconds, 40 seconds, 160 seconds and so on. After the last retry the job moves to the `failed` state.

You can retry failed jobs from the command line:

```sh
queuetopia retry --queue email --state failed
```

Jobs that should never retry can set `retries=0`. Jobs that call external APIs should be idempotent, because a worker can crash after the API call and before it marks the job done.

## Scheduling

Use `run_at` to delay a job:

```python
from datetime import timedelta
send_welcome_email.delay(user_id=42, run_at=timedelta(hours=1))
```

For periodic jobs, add a cron expression to the decorator. One worker in the cluster takes a short advisory lock and enqueues the periodic jobs, so each run happens once.

```python
@job(queue="reports", cron="0 6 * * *")
def daily_report() -> None:
    ...
```

## Monitoring

`queuetopia stats` prints the number of jobs per queue and state. The same numbers are available as Prometheus metrics on port 9187 when you start a worker with `--metrics`.

Useful alerts:

- the oldest `queued` job is more than five minutes old,
- the number of `failed` jobs grows,
- no worker has sent a heartbeat for one minute.

## Configuration reference

| Setting | Default | Meaning |
| --- | --- | --- |
| `QUEUETOPIA_DATABASE_URL` | none | Postgres connection string |
| `QUEUETOPIA_POLL_INTERVAL` | `0.5` | Seconds between polls |
| `QUEUETOPIA_LOCK_TIMEOUT` | `300` | Seconds before a locked job returns to the queue |
| `QUEUETOPIA_MAX_RETRIES` | `5` | Default retries for jobs without a `retries` argument |

## Upgrading from 1.x

Version 2.0 renames the `priority` column to `rank` and drops support for Python 3.8. Run `queuetopia migrate` after the upgrade. Old workers and new workers can run side by side during the upgrade, because the migration keeps a view with the old column name until the next major version.

## License

Queuetopia is released under the MIT license.
