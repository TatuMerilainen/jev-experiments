"""Writes the test tasks: long command outputs where the answer sits in a few lines.

Run once: python3 tests/make_tasks.py. The outputs are made up and fixed by the random seed.
"""

import json
import random
from pathlib import Path

HERE = Path(__file__).resolve().parent / "tasks"
rnd = random.Random(7)


def pytest_failure() -> str:
    modules = ["queue", "worker", "retry", "scheduler", "invoice", "billing", "api", "auth", "cron", "metrics"]
    verbs = ["enqueue", "dequeue", "retry", "timeout", "cancel", "schedule", "render", "parse", "sign", "export"]
    lines = [
        "============================= test session starts ==============================",
        "platform linux -- Python 3.12.4, pytest-8.3.2, pluggy-1.5.0 -- /home/dev/queuetopia/.venv/bin/python",
        "cachedir: .pytest_cache",
        "rootdir: /home/dev/queuetopia",
        "configfile: pyproject.toml",
        "plugins: cov-5.0.0, asyncio-0.23.8",
        "collected 318 items",
        "",
    ]
    tests = []
    for i in range(318):
        m, v = rnd.choice(modules), rnd.choice(verbs)
        tests.append(f"tests/test_{m}.py::test_{v}_{rnd.choice(['basic', 'empty', 'large', 'unicode', 'twice', 'expired'])}_{i}")
    failing = "tests/test_invoice.py::test_invoice_vat_line"
    tests[201] = failing
    for i, t in enumerate(tests):
        status = "FAILED" if t == failing else "PASSED"
        lines.append(f"{t} {status}".ljust(73) + f"[{int(100 * (i + 1) / len(tests)):3d}%]")
    lines += [
        "",
        "=================================== FAILURES ===================================",
        "_____________________________ test_invoice_vat_line _____________________________",
        "",
        "    def test_invoice_vat_line():",
        "        invoice = make_invoice(customer=EU_CUSTOMER)",
        "        header = render_header(invoice)",
        ">       assert header.lines[2] == \"VAT FI12345678\"",
        "E       AssertionError: assert 'VAT: FI12345678' == 'VAT FI12345678'",
        "E         - VAT FI12345678",
        "E         + VAT: FI12345678",
        "E         ?    +",
        "",
        "tests/test_invoice.py:88: AssertionError",
        "=========================== short test summary info ============================",
        "FAILED tests/test_invoice.py::test_invoice_vat_line - AssertionError: assert 'VAT: FI12345678' == 'VAT FI12345678'",
        "======================== 1 failed, 317 passed in 41.27s =========================",
    ]
    return "\n".join(lines)


def build_error() -> str:
    lines = ["> dashboard@2.4.0 build", "> webpack --mode production", "", "[webpack-cli] Compiler starting..."]
    pkgs = ["chart.js", "date-fns", "lodash-es", "react-router", "zod", "axios", "immer", "dayjs", "uuid", "clsx"]
    for i in range(70):
        p = rnd.choice(pkgs)
        lines += [
            f"WARNING in ./node_modules/{p}/dist/{p.replace('.', '-')}.esm.js",
            "Module Warning (from ./node_modules/source-map-loader/dist/cjs.js):",
            f"Failed to parse source map from '/home/dev/dashboard/node_modules/{p}/src/index.ts' file: Error: ENOENT: no such file or directory",
            "",
        ]
        if i == 48:
            lines += [
                "ERROR in ./src/api/client.ts 42:17-27",
                "[tsl] ERROR in /home/dev/dashboard/src/api/client.ts(42,17)",
                "      TS2339: Property 'retryAfter' does not exist on type 'Response'.",
                "",
            ]
    lines += [
        "asset main.3f9a1c.js 1.21 MiB [emitted] [immutable] [minimized] [big] (name: main)",
        "asset vendors.8b2d4e.js 812 KiB [emitted] [immutable] [minimized] [big] (name: vendors)",
        "modules by path ./src/ 412 KiB 188 modules",
        "modules by path ./node_modules/ 2.31 MiB 941 modules",
        "webpack 5.94.0 compiled with 1 error and 70 warnings in 18342 ms",
    ]
    return "\n".join(lines)


def oom_log() -> str:
    lines = []
    t = 13 * 3600 + 51 * 60
    job = 48210
    while t < 14 * 3600 + 3 * 60 + 11:
        h, m, s = t // 3600, t // 60 % 60, t % 60
        stamp = f"Oct 16 {h:02d}:{m:02d}:{s:02d} app-3"
        if rnd.random() < 0.08:
            lines.append(f"{stamp} queuetopia-worker[4121]: INFO heartbeat ok queue=email depth={rnd.randint(0, 40)}")
        else:
            job += 1
            lines.append(f"{stamp} queuetopia-worker[4121]: INFO job {job} done in {rnd.randint(40, 900)}ms queue={rnd.choice(['email', 'pdf', 'webhooks'])}")
        if t == 14 * 3600 + 2 * 60 + 48:
            lines.append(f"{stamp} queuetopia-worker[4121]: WARNING memory usage 1.9 GiB of 2.0 GiB limit")
        t += rnd.randint(1, 4)
    lines += [
        "Oct 16 14:03:11 app-3 kernel: Out of memory: Killed process 4121 (queuetopia-work) total-vm:2412044kB, anon-rss:2051220kB",
        "Oct 16 14:03:11 app-3 systemd[1]: queuetopia-worker.service: Main process exited, code=killed, status=9/KILL",
        "Oct 16 14:03:11 app-3 systemd[1]: queuetopia-worker.service: Failed with result 'oom-kill'.",
        "Oct 16 14:03:16 app-3 systemd[1]: queuetopia-worker.service: Scheduled restart job, restart counter is at 3.",
        "Oct 16 14:03:16 app-3 systemd[1]: Started queuetopia-worker.service - Queuetopia worker.",
    ]
    t = 14 * 3600 + 3 * 60 + 17
    while len("\n".join(lines)) < 26000:
        h, m, s = t // 3600, t // 60 % 60, t % 60
        job += 1
        lines.append(f"Oct 16 {h:02d}:{m:02d}:{s:02d} app-3 queuetopia-worker[5530]: INFO job {job} done in {rnd.randint(40, 900)}ms queue=email")
        t += rnd.randint(1, 4)
    return "\n".join(lines)


def npm_eresolve() -> str:
    pkgs = ["react", "react-dom", "@babel/core", "webpack", "eslint", "typescript", "postcss", "date-fns", "chart.js", "zod",
            "@types/node", "vite", "jest", "prettier", "axios", "lodash", "uuid", "semver", "glob", "minimatch"]
    lines = ["npm verb cli /usr/local/bin/node /usr/local/bin/npm", "npm info using npm@10.8.2", "npm info using node@v22.9.0"]
    while len("\n".join(lines)) < 24000:
        p = rnd.choice(pkgs)
        lines.append(f"npm http fetch GET 200 https://registry.npmjs.org/{p} {rnd.randint(8, 300)}ms (cache {rnd.choice(['hit', 'revalidated', 'miss'])})")
        if rnd.random() < 0.1:
            lines.append(f"npm verb reify {p} added to the ideal tree")
    lines += [
        "npm ERR! code ERESOLVE",
        "npm ERR! ERESOLVE unable to resolve dependency tree",
        "npm ERR!",
        "npm ERR! While resolving: dashboard@2.4.0",
        "npm ERR! Found: react@19.1.0",
        "npm ERR! node_modules/react",
        "npm ERR!   react@\"^19.1.0\" from the root project",
        "npm ERR!",
        "npm ERR! Could not resolve dependency:",
        "npm ERR! peer react@\"^18.2.0\" from react-datepicker@6.9.0",
        "npm ERR! node_modules/react-datepicker",
        "npm ERR!   react-datepicker@\"^6.9.0\" from the root project",
        "npm ERR!",
        "npm ERR! Fix the upstream dependency conflict, or retry",
        "npm ERR! this command with --force or --legacy-peer-deps",
        "npm ERR! to accept an incorrect (and potentially broken) dependency resolution.",
        "npm verb exit 1",
    ]
    return "\n".join(lines)


def startup_port() -> str:
    lines = ["  .   ____          _            __ _ _", " :: Spring Boot ::                (v3.3.4)", ""]
    beans = ["dataSource", "entityManagerFactory", "transactionManager", "jacksonObjectMapper", "securityFilterChain",
             "taskScheduler", "cacheManager", "meterRegistry", "restTemplate", "invoiceService", "billingClient"]
    t = 0
    while len("\n".join(lines)) < 25000:
        t += rnd.randint(3, 40)
        stamp = f"2026-10-16T09:12:{(t // 1000) % 60:02d}.{t % 1000:03d}+03:00"
        kind = rnd.random()
        if kind < 0.5:
            lines.append(f"{stamp}  DEBUG 7812 --- [main] o.s.b.f.s.DefaultListableBeanFactory : Creating shared instance of singleton bean '{rnd.choice(beans)}'")
        elif kind < 0.8:
            lines.append(f"{stamp}  DEBUG 7812 --- [main] o.s.c.e.PropertySourcesPropertyResolver : Found key 'spring.{rnd.choice(['jpa', 'cache', 'mail', 'task'])}.{rnd.choice(['enabled', 'timeout', 'pool-size', 'mode'])}' in PropertySource 'application.yml'")
        else:
            lines.append(f"{stamp}  INFO 7812 --- [main] o.s.d.r.c.RepositoryConfigurationDelegate : Finished Spring Data repository scanning in {rnd.randint(20, 300)} ms.")
        if len(lines) == 160:
            lines.append(f"{stamp}  INFO 7812 --- [main] o.s.b.w.embedded.tomcat.TomcatWebServer  : Tomcat started on port 8443 (https) with context path '/billing'")
    lines.append("2026-10-16T09:12:59.874+03:00  INFO 7812 --- [main] c.e.billing.BillingApplication           : Started BillingApplication in 6.912 seconds (process running for 7.4)")
    return "\n".join(lines)


TASKS = [
    {"id": "pytest-failure", "make": pytest_failure, "command": "./run.sh", "purpose": "Run the test suite",
     "question": "Why did the test suite fail?", "needles": ["tests/test_invoice.py:88", "AssertionError: assert 'VAT: FI12345678'"],
     "answer": ["invoice", "vat"], "exit": 1},
    {"id": "build-error", "make": build_error, "command": "./run.sh", "purpose": "Run the production build",
     "question": "Why did the build fail?", "needles": ["TS2339: Property 'retryAfter'", "src/api/client.ts(42,17)"],
     "answer": ["client.ts", "retryafter"], "exit": 1},
    {"id": "oom-restart", "make": oom_log, "command": "./run.sh", "purpose": "Show the worker log",
     "question": "Why did the queuetopia worker restart around 14:03?", "needles": ["Out of memory: Killed process 4121", "status=9/KILL"],
     "answer": ["memory"], "exit": 0},
    {"id": "npm-eresolve", "make": npm_eresolve, "command": "./run.sh", "purpose": "Install the dependencies",
     "question": "Why did npm install fail?", "needles": ["peer react@\"^18.2.0\" from react-datepicker@6.9.0", "ERESOLVE unable to resolve"],
     "answer": ["react-datepicker"], "exit": 1},
    {"id": "startup-port", "make": startup_port, "command": "./run.sh", "purpose": "Start the billing service",
     "question": "Which port did the billing service start on?", "needles": ["Tomcat started on port 8443"],
     "answer": ["8443"], "exit": 0},
]

if __name__ == "__main__":
    HERE.mkdir(exist_ok=True)
    index = []
    for task in TASKS:
        text = task["make"]()
        for needle in task["needles"]:
            assert needle in text, (task["id"], needle)
        (HERE / f"{task['id']}.txt").write_text(text + "\n")
        index.append({k: v for k, v in task.items() if k != "make"})
        print(f"{task['id']:<16} {len(text):6d} chars {text.count(chr(10)) + 1:5d} lines")
    (HERE / "tasks.json").write_text(json.dumps(index, indent=2) + "\n")
