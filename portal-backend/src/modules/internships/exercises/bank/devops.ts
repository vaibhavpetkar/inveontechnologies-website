import type { ExerciseSeed } from "../types.js";

export default [
  {
    title: "Dockerfile for a Node app",
    brief: "Write a Dockerfile that runs a Node.js app (server.js) on port 3000.",
    steps: [
      "Start FROM a node image (for example node:20-alpine) and set WORKDIR /app",
      "COPY package*.json first, then RUN npm ci (or npm install), then COPY . .",
      "EXPOSE 3000",
      "Start the app with CMD [\"node\", \"server.js\"]",
    ],
    level: "basic",
    editor: "dockerfile",
    starter: `FROM node:20-alpine

# Set the working directory, install dependencies, copy the code,
# expose port 3000 and start server.js
`,
    solution: `FROM node:20-alpine

WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
EXPOSE 3000
CMD ["node", "server.js"]
`,
    check: {
      rules: [
        { match: String.raw`^\s*FROM\s+node(:\S+)?`, flags: "im", message: "Starts FROM a node image" },
        { match: String.raw`^\s*WORKDIR\s+/app/?\s*$`, flags: "im", message: "WORKDIR /app" },
        { match: String.raw`^\s*COPY\s+package\S*\.json[\s\S]*^\s*RUN\s+npm\s+(ci|install)\b[\s\S]*^\s*COPY\s+\.\s+\S+`, flags: "im", message: "Copies package*.json and installs before copying the rest of the code" },
        { match: String.raw`^\s*EXPOSE\s+3000\b`, flags: "im", message: "EXPOSE 3000" },
        { match: String.raw`^\s*CMD\s+(\[\s*"node"\s*,\s*"server\.js"\s*\]|node\s+server\.js)`, flags: "im", message: "CMD [\"node\", \"server.js\"]" },
      ],
    },
  },
  {
    title: "Git feature branch",
    brief: "Write the git commands to create a feature branch, commit your work on it and push it to GitHub.",
    steps: [
      "Create and switch to the branch feature/login (git checkout -b or git switch -c)",
      "Stage all changes with git add . (or -A)",
      "Commit with the message \"Add login page\"",
      "Push to origin and set the upstream: git push -u origin feature/login",
    ],
    level: "basic",
    editor: "shell",
    starter: `# 1. Create and switch to the branch feature/login

# 2. Stage all changes

# 3. Commit with the message "Add login page"

# 4. Push the branch and set the upstream
`,
    solution: `git checkout -b feature/login
git add .
git commit -m "Add login page"
git push -u origin feature/login
`,
    check: {
      rules: [
        { match: String.raw`git\s+(checkout\s+-b|switch\s+(-c|--create))\s+feature/login\b`, message: "Creates and switches to feature/login" },
        { match: String.raw`git\s+add\s+(\.|-A|--all)(\s|$)`, message: "Stages all changes" },
        { match: String.raw`git\s+commit\s+(-a\s+)?-m\s+["']Add login page["']`, message: "Commits with the message \"Add login page\"" },
        { match: String.raw`git\s+push\s+(-u|--set-upstream)\s+origin\s+feature/login\b`, message: "Pushes with git push -u origin feature/login" },
      ],
    },
  },
  {
    title: "Script with an argument",
    brief: "Write a bash script that greets the name given as its first argument, and prints a usage message and exits with code 1 when no name is given.",
    steps: [
      "Read the first argument ($1)",
      "If it is empty (use [ -z \"$1\" ]), echo a line starting with \"Usage\" and exit 1",
      "Close the if with fi",
      "Otherwise echo \"Hello, NAME!\" using the argument",
    ],
    level: "basic",
    editor: "shell",
    starter: `#!/bin/bash

# Check the first argument, then greet
echo "Hello!"
`,
    solution: `#!/bin/bash

name="$1"

if [ -z "$name" ]; then
  echo "Usage: greet.sh NAME"
  exit 1
fi

echo "Hello, $name!"
`,
    check: {
      rules: [
        { match: String.raw`if\s+\[\[?\s+-z\s+"?\$\{?(1|\w+)\}?"?\s+\]\]?`, message: "Checks for an empty argument with [ -z ... ]" },
        { match: String.raw`echo\s+["']?Usage`, message: "Prints a Usage message" },
        { match: String.raw`\bexit\s+1\b`, message: "Exits with code 1 when the name is missing" },
        { match: String.raw`\bfi\b`, message: "Closes the if with fi" },
        { match: String.raw`echo\s+"Hello, \$\{?(1|\w+)\}?!"`, message: "Echoes \"Hello, NAME!\"" },
      ],
    },
  },
  {
    title: "Compose a static web server",
    brief: "Write a docker-compose.yml that serves the ./site folder with nginx on port 8080.",
    steps: [
      "A service called web under services: using the image nginx:alpine",
      "Map port \"8080:80\"",
      "Mount ./site to /usr/share/nginx/html (read-only :ro is fine)",
      "restart: unless-stopped",
    ],
    level: "basic",
    editor: "yaml",
    starter: `services:
  web:
    image: nginx:alpine
    # Add ports, volumes and a restart policy
`,
    solution: `services:
  web:
    image: nginx:alpine
    ports:
      - "8080:80"
    volumes:
      - ./site:/usr/share/nginx/html:ro
    restart: unless-stopped
`,
    check: {
      rules: [
        { match: String.raw`^services:\s*\n\s+web:\s*$`, flags: "m", message: "A web service under services:" },
        { match: String.raw`image:\s*["']?nginx(:[\w.-]+)?["']?\s*$`, flags: "m", message: "Uses the nginx image" },
        { match: String.raw`ports:\s*\n\s*-\s*["']?8080:80["']?\s*$`, flags: "m", message: "Maps port 8080:80" },
        { match: String.raw`volumes:\s*\n\s*-\s*["']?\./site/?:/usr/share/nginx/html(:ro)?["']?\s*$`, flags: "m", message: "Mounts ./site to /usr/share/nginx/html" },
        { match: String.raw`restart:\s*["']?unless-stopped["']?`, message: "restart: unless-stopped" },
      ],
    },
  },
  {
    title: "Slim Python Dockerfile",
    brief: "Write a small, safe Dockerfile for a Python web app served by gunicorn on port 8000.",
    steps: [
      "FROM a python slim image (for example python:3.12-slim) and ENV PYTHONUNBUFFERED=1",
      "COPY requirements.txt first, RUN pip install --no-cache-dir -r requirements.txt, then COPY . .",
      "Create a user and switch to it with USER (not root)",
      "EXPOSE 8000 and CMD that starts gunicorn",
    ],
    level: "intermediate",
    editor: "dockerfile",
    starter: `FROM python:3.12

WORKDIR /app
COPY . .
RUN pip install -r requirements.txt
CMD ["python", "app.py"]
`,
    solution: `FROM python:3.12-slim

ENV PYTHONUNBUFFERED=1
WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY . .

RUN useradd --create-home appuser
USER appuser

EXPOSE 8000
CMD ["gunicorn", "--bind", "0.0.0.0:8000", "app:app"]
`,
    check: {
      rules: [
        { match: String.raw`^\s*FROM\s+python:\S*slim\S*`, flags: "im", message: "Uses a python slim image" },
        { match: String.raw`^\s*ENV\s+PYTHONUNBUFFERED\s*[= ]\s*["']?1`, flags: "im", message: "ENV PYTHONUNBUFFERED=1" },
        { match: String.raw`^\s*RUN\s+pip\s+install\b[^\n]*--no-cache-dir`, flags: "im", message: "pip install uses --no-cache-dir" },
        { match: String.raw`^\s*COPY\s+requirements\.txt\b[\s\S]*^\s*RUN\s+pip\s+install\b[\s\S]*^\s*COPY\s+\.\s+\S+`, flags: "im", message: "Installs requirements before copying the rest of the code" },
        { match: String.raw`^\s*USER\s+(?!root\b)\w+`, flags: "im", message: "Runs as a non-root USER" },
        { match: String.raw`^\s*EXPOSE\s+8000\b`, flags: "im", message: "EXPOSE 8000" },
        { match: String.raw`^\s*CMD\s+.*gunicorn`, flags: "im", message: "CMD starts gunicorn" },
      ],
    },
  },
  {
    title: "Compose app with Postgres",
    brief: "Write a docker-compose.yml with an app built from the current folder and a Postgres database that keeps its data in a named volume.",
    steps: [
      "Service app: build: . , ports \"3000:3000\", a DATABASE_URL environment variable, depends_on: db",
      "Service db: image postgres (for example postgres:16) with POSTGRES_USER, POSTGRES_PASSWORD and POSTGRES_DB",
      "Mount a named volume to /var/lib/postgresql/data",
      "Declare the named volume under a top-level volumes: key",
    ],
    level: "intermediate",
    editor: "yaml",
    starter: `services:
  app:
    build: .
    ports:
      - "3000:3000"

  # Add the db service here
`,
    solution: `services:
  app:
    build: .
    ports:
      - "3000:3000"
    environment:
      DATABASE_URL: postgres://app:secret@db:5432/appdb
    depends_on:
      - db

  db:
    image: postgres:16
    environment:
      POSTGRES_USER: app
      POSTGRES_PASSWORD: secret
      POSTGRES_DB: appdb
    volumes:
      - db-data:/var/lib/postgresql/data

volumes:
  db-data:
`,
    check: {
      rules: [
        { match: String.raw`^\s+app:\s*\n(\s+.*\n)*?\s+build:\s*["']?\.["']?\s*$`, flags: "m", message: "The app service is built from ." },
        { match: String.raw`DATABASE_URL\s*[:=]`, message: "The app has a DATABASE_URL environment variable" },
        { match: String.raw`depends_on:\s*(\n\s*-\s*["']?db["']?|\n\s+db:|\[\s*["']?db["']?)`, message: "The app depends_on db" },
        { match: String.raw`^\s+db:\s*\n(\s+.*\n)*?\s+image:\s*["']?postgres`, flags: "m", message: "A db service using the postgres image" },
        { match: String.raw`POSTGRES_USER\s*[:=][\s\S]*POSTGRES_PASSWORD\s*[:=][\s\S]*POSTGRES_DB\s*[:=]|POSTGRES_PASSWORD\s*[:=][\s\S]*POSTGRES_USER\s*[:=][\s\S]*POSTGRES_DB\s*[:=]`, message: "Sets POSTGRES_USER, POSTGRES_PASSWORD and POSTGRES_DB" },
        { match: String.raw`-\s*["']?([\w-]+):/var/lib/postgresql/data["']?[\s\S]*^volumes:\s*\n\s+\1:`, flags: "m", message: "A named volume for /var/lib/postgresql/data, declared under volumes:" },
      ],
    },
  },
  {
    title: "Test workflow in Actions",
    brief: "Write a GitHub Actions workflow that installs and tests a Node.js project on every push to main and on every pull request.",
    steps: [
      "Trigger on push to main and on pull_request",
      "A job that runs-on: ubuntu-latest",
      "Steps: actions/checkout, then actions/setup-node with node-version 20",
      "Then run npm ci and npm test",
    ],
    level: "intermediate",
    editor: "yaml",
    starter: `name: CI

on:
  push:

jobs:
  test:
    steps:
      # Add the steps here
`,
    solution: `name: CI

on:
  push:
    branches: [main]
  pull_request:

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 20
      - run: npm ci
      - run: npm test
`,
    check: {
      rules: [
        { match: String.raw`^["']?on["']?:[\s\S]*push:[\s\S]*branches:\s*(\[\s*["']?main["']?|\n\s*-\s*["']?main["']?)`, flags: "m", message: "Runs on push to main" },
        { match: String.raw`^\s*pull_request:`, flags: "m", message: "Runs on pull_request" },
        { match: String.raw`runs-on:\s*ubuntu-latest`, message: "runs-on: ubuntu-latest" },
        { match: String.raw`uses:\s*actions/checkout@v\d+`, message: "Checks out the code with actions/checkout" },
        { match: String.raw`uses:\s*actions/setup-node@v\d+\s*\n\s*with:\s*\n\s*node-version:\s*["']?20`, message: "Sets up Node 20 with actions/setup-node" },
        { match: String.raw`run:\s*npm\s+ci\b`, message: "Runs npm ci" },
        { match: String.raw`run:\s*npm\s+(run\s+)?test\b`, message: "Runs npm test" },
      ],
    },
  },
  {
    title: "Count errors in log files",
    brief: "Write a bash script that prints how many ERROR lines each .log file in the logs folder has, then the total.",
    steps: [
      "Loop over the files with for file in logs/*.log; do ... done",
      "Count the lines with grep -c \"ERROR\" \"$file\" and echo \"$file: $count\"",
      "Add each count to a total with $(( ... ))",
      "After the loop, echo \"Total: $total\"",
    ],
    level: "intermediate",
    editor: "shell",
    starter: `#!/bin/bash

total=0

# Loop over logs/*.log here

echo "Total: 0"
`,
    solution: `#!/bin/bash

total=0

for file in logs/*.log; do
  count=$(grep -c "ERROR" "$file")
  echo "$file: $count"
  total=$((total + count))
done

echo "Total: $total"
`,
    check: {
      rules: [
        { match: String.raw`for\s+(\w+)\s+in\s+["']?(\./)?logs/\*\.log["']?\s*(;\s*do|\n\s*do)\b`, message: "Loops over logs/*.log" },
        { match: String.raw`grep\s+(-c\s+["']?ERROR["']?|["']?ERROR["']?\s+-c)\s+"?\$\{?\w+\}?"?`, message: "Counts ERROR lines with grep -c" },
        { match: String.raw`\w+=\$\(\(\s*\$?\w+\s*\+\s*\$?\w+\s*\)\)|\(\(\s*\w+\s*\+=\s*\$?\w+\s*\)\)`, message: "Adds each count to the total" },
        { match: String.raw`\bdone\b`, message: "Closes the loop with done" },
        { match: String.raw`echo\s+"Total: \$\{?total\}?"`, message: "Prints \"Total: $total\"" },
      ],
    },
  },
  {
    title: "Multi-stage frontend build",
    brief: "Write a multi-stage Dockerfile: build a frontend with Node, then serve only the built files with nginx.",
    steps: [
      "Stage 1: FROM node:20-alpine AS build, WORKDIR /app, install dependencies, COPY . . and RUN npm run build",
      "Stage 2: FROM nginx:alpine",
      "COPY --from=build /app/dist /usr/share/nginx/html",
      "EXPOSE 80",
    ],
    level: "advanced",
    editor: "dockerfile",
    starter: `FROM node:20-alpine

WORKDIR /app
COPY . .
RUN npm install
RUN npm run build
CMD ["npx", "serve", "dist"]
`,
    solution: `FROM node:20-alpine AS build
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM nginx:alpine
COPY --from=build /app/dist /usr/share/nginx/html
EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
`,
    check: {
      rules: [
        { match: String.raw`^\s*FROM\s+node(:\S+)?\s+AS\s+build\s*$`, flags: "im", message: "A first stage FROM node ... AS build" },
        { match: String.raw`^\s*RUN\s+npm\s+run\s+build\b`, flags: "im", message: "Runs npm run build" },
        { match: String.raw`^\s*FROM\s+nginx(:\S+)?\s*$`, flags: "im", message: "A second stage FROM nginx" },
        { match: String.raw`^\s*COPY\s+--from=build\s+/app/dist/?\s+/usr/share/nginx/html/?\s*$`, flags: "im", message: "COPY --from=build /app/dist /usr/share/nginx/html" },
        { match: String.raw`^\s*EXPOSE\s+80\s*$`, flags: "im", message: "EXPOSE 80" },
      ],
    },
  },
  {
    title: "Build and push image in CI",
    brief: "Write a GitHub Actions workflow that builds a Docker image and pushes it to Docker Hub on every push to main, using secrets for the login.",
    steps: [
      "Trigger on push to main; one job that runs-on: ubuntu-latest and starts with actions/checkout",
      "Log in with docker/login-action, username and password from ${{ secrets.DOCKERHUB_USERNAME }} and ${{ secrets.DOCKERHUB_TOKEN }}",
      "Build and push with docker/build-push-action with push: true",
      "Tag the image as <username>/myapp:latest (tags: ${{ secrets.DOCKERHUB_USERNAME }}/myapp:latest)",
    ],
    level: "advanced",
    editor: "yaml",
    starter: `name: Docker

on:
  push:
    branches: [main]

jobs:
  docker:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      # Log in to Docker Hub, then build and push the image
`,
    solution: `name: Docker

on:
  push:
    branches: [main]

jobs:
  docker:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: docker/login-action@v3
        with:
          username: \${{ secrets.DOCKERHUB_USERNAME }}
          password: \${{ secrets.DOCKERHUB_TOKEN }}
      - uses: docker/build-push-action@v6
        with:
          context: .
          push: true
          tags: \${{ secrets.DOCKERHUB_USERNAME }}/myapp:latest
`,
    check: {
      rules: [
        { match: String.raw`branches:\s*(\[\s*["']?main["']?|\n\s*-\s*["']?main["']?)`, message: "Runs on push to main" },
        { match: String.raw`uses:\s*docker/login-action@v\d+`, message: "Logs in with docker/login-action" },
        { match: String.raw`username:\s*\$\{\{\s*secrets\.\w+\s*\}\}`, message: "The username comes from secrets" },
        { match: String.raw`password:\s*\$\{\{\s*secrets\.\w+\s*\}\}`, message: "The password comes from secrets" },
        { match: String.raw`uses:\s*docker/build-push-action@v\d+`, message: "Builds with docker/build-push-action" },
        { match: String.raw`push:\s*true\b`, message: "push: true" },
        { match: String.raw`tags:\s*[^\n]*/myapp:latest`, message: "Tags the image as <username>/myapp:latest" },
      ],
    },
  },
] satisfies ExerciseSeed[];
