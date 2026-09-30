import { ruleQ } from "../../author.js";
import type { PracticeUnit } from "../../types.js";
import { bq, exactOut, m, not, sh, sq } from "./shared.js";

export const processes: PracticeUnit = {
  key: "processes",
  title: "Processes, services and logs",
  summary: "ps, top, signals and kill, background jobs, systemd services with systemctl, unit files and journalctl logs",
  reading: sh`## What is a process?

Every running program is a process with a number, the PID. A process has an owner, uses CPU and memory, and has a parent (the process that started it). On a server your web app, the database and even your own shell are all processes.

## Looking at processes

` + "```bash" + sh`
ps aux                          # every process, with user, PID, %CPU, %MEM, command
ps aux | grep node              # find one (the grep itself also shows up)
pgrep -fl gunicorn              # PIDs and names matching a pattern
ps -ef --forest                 # parent/child tree
top                             # live view; press M to sort by memory, P by CPU, q to quit
htop                            # a friendlier top, if installed
` + "```" + sh`

Quick health checks worth remembering: uptime (load averages), free -h (memory), df -h (disk space per filesystem), du -sh * (size of each item here).

The load average (three numbers for 1, 5 and 15 minutes) is roughly how many processes are running or waiting. On a machine with 4 CPU cores, a load of 4 means fully busy; 8 means work is queuing.

## Signals and kill

kill sends a signal to a process. Despite the name, the default is a polite request:

- 15 SIGTERM (default): please shut down cleanly. Apps close connections and save state.
- 2 SIGINT: what Ctrl+C sends.
- 1 SIGHUP: many daemons reload their config on it.
- 9 SIGKILL: stop immediately. The process cannot catch it, so nothing is cleaned up. Use it only when SIGTERM did not work.

` + "```bash" + sh`
kill 4821           # SIGTERM
kill -9 4821        # SIGKILL, last resort
pkill -f "python app.py"
` + "```" + sh`

When a process is killed by a signal, its exit status is 128 plus the signal number: 137 means SIGKILL (often the out-of-memory killer), 130 means Ctrl+C.

## Foreground and background jobs

- cmd & runs a command in the background of your shell; jobs lists them; fg brings one back.
- Ctrl+Z pauses the foreground job; bg continues it in the background.
- Background jobs die when you log out. nohup cmd > out.log 2>&1 & keeps one running, but for real services use systemd (or tmux/screen for your own long tasks).

## systemd services and systemctl

Modern distributions (Ubuntu, Debian, RHEL, Amazon Linux) start and supervise services with systemd:

` + "```bash" + sh`
sudo systemctl status nginx       # running? recent log lines
sudo systemctl start nginx
sudo systemctl stop nginx
sudo systemctl restart nginx      # stop + start
sudo systemctl reload nginx       # re-read config without dropping connections
sudo systemctl enable nginx       # start at boot (enable --now also starts it)
systemctl is-active nginx
systemctl list-units --type=service --state=failed
` + "```" + sh`

start is for now, enable is for the next boot. Forgetting enable is why "it worked until the server rebooted".

## Your own service: a unit file

` + "```ini" + sh`
[Unit]
Description=Orders API
After=network.target

[Service]
User=deploy
WorkingDirectory=/opt/orders
ExecStart=/usr/bin/node server.js
Restart=on-failure
Environment=NODE_ENV=production

[Install]
WantedBy=multi-user.target
` + "```" + sh`

Save it as /etc/systemd/system/orders.service, then run sudo systemctl daemon-reload and sudo systemctl enable --now orders. ExecStart needs a full path. Restart=on-failure brings the app back if it crashes, and User= keeps it from running as root.

## Logs with journalctl

systemd collects the output of every service in the journal:

` + "```bash" + sh`
journalctl -u nginx                   # logs of one unit
journalctl -u orders -f               # follow live
journalctl -u orders --since "1 hour ago"
journalctl -p err -b                  # errors since the last boot
journalctl -u orders -n 100 --no-pager
` + "```" + sh`

Many apps also write files under /var/log (nginx uses /var/log/nginx/access.log and error.log), where tail -f and grep work.

## How these assignments are checked

Commands like systemctl and journalctl change a real machine, so those sheets are read and rule-checked, not run. Questions that analyse ps, uptime or exit-code output are bash scripts run against hidden inputs.`,
  questions: [
    sq("Stop a stuck process", "A Python script app.py is stuck and using 100% CPU. Write the commands to find it and stop it, gently first.", ["List all processes and filter for app.py with grep", "Get just its PID with pgrep -f", "Send it the default SIGTERM with kill and the PID 4821", "If it is still there, send SIGKILL to 4821", "Check that nothing matches any more with pgrep -f"], sh`#!/bin/bash
ps aux | grep app.py
pgrep -f app.py
kill 4821
kill -9 4821
pgrep -f app.py
`, [m(String.raw`^\s*ps\s+(aux|-ef)\s*\|\s*grep\s+["']?app\.py`, "Filters the process list with ps aux | grep"), m(String.raw`^\s*pgrep\s+-f\s+["']?app\.py`, "Finds the PID with pgrep -f"), m(String.raw`^\s*kill\s+(-15\s+|-TERM\s+|-SIGTERM\s+)?4821\s*$`, "Sends SIGTERM first"), m(String.raw`^\s*kill\s+(-9|-KILL|-SIGKILL)\s+4821\s*$`, "Uses SIGKILL only as the last resort"), m(String.raw`^\s*kill\s+(-15\s+|-TERM\s+|-SIGTERM\s+)?4821\s*$[\s\S]*^\s*kill\s+(-9|-KILL|-SIGKILL)\s+4821`, "Tries SIGTERM before SIGKILL")]),

    sq("Manage the nginx service", "Write the systemctl commands for these jobs on the nginx service.", ["Show its status", "Start it now and make it start at boot (two commands, or one with enable --now)", "Reload it after a config change without dropping connections", "Check whether it is active", "List every failed service on the machine"], sh`#!/bin/bash
sudo systemctl status nginx
sudo systemctl enable --now nginx
sudo systemctl reload nginx
systemctl is-active nginx
systemctl list-units --type=service --state=failed
`, [m(String.raw`^\s*(sudo\s+)?systemctl\s+status\s+nginx`, "Shows the status"), m(String.raw`^\s*(sudo\s+)?systemctl\s+enable\s+(--now\s+nginx|nginx\s+--now)|(?=[\s\S]*^\s*(sudo\s+)?systemctl\s+start\s+nginx)^\s*(sudo\s+)?systemctl\s+enable\s+nginx`, "Starts it now and enables it at boot"), m(String.raw`^\s*(sudo\s+)?systemctl\s+reload\s+nginx`, "Reloads instead of restarting"), m(String.raw`^\s*(sudo\s+)?systemctl\s+is-active\s+nginx`, "Checks is-active"), m(String.raw`systemctl\s+(list-units\b.*--state=failed|--failed)`, "Lists failed services")]),

    sq("Read service logs", "The orders service keeps failing. Write the journalctl commands to investigate.", ["Show all logs of the orders unit", "Follow its logs live", "Show its logs from the last 30 minutes", "Show only error-priority messages from the current boot (whole system)", "Show the last 50 lines of the unit without the pager"], sh`#!/bin/bash
journalctl -u orders
journalctl -u orders -f
journalctl -u orders --since "30 min ago"
journalctl -p err -b
journalctl -u orders -n 50 --no-pager
`, [m(String.raw`^\s*(sudo\s+)?journalctl\s+-u\s+orders(\.service)?\s*$`, "Shows the unit's logs with -u"), m(String.raw`journalctl\s+-u\s+orders\S*\s+-f\b|journalctl\s+-f\s+-u\s+orders`, "Follows with -f"), m(String.raw`journalctl.*--since\s+["']30 min(ute)?s? ago["']`, "Filters with --since \"30 min ago\""), m(String.raw`journalctl\s+(-p\s+err\s+-b|-b\s+-p\s+err)`, "Shows errors from this boot with -p err -b"), m(String.raw`journalctl.*-n\s+50.*--no-pager|journalctl.*--no-pager.*-n\s+50`, "Shows the last 50 lines without the pager")], { level: "intermediate" }),

    sq("Quick server health check", "You log into a slow server. Write the commands to check it quickly.", ["Show uptime and load averages", "Show memory in human units", "Show disk space in human units", "Show the 10 processes using the most memory (ps sorted by -%mem, piped into head)", "Show one batch snapshot of top (non-interactive), first 20 lines"], sh`#!/bin/bash
uptime
free -h
df -h
ps aux --sort=-%mem | head -n 11
top -b -n 1 | head -n 20
`, [m(String.raw`^\s*uptime\s*$`, "Checks uptime and load"), m(String.raw`^\s*free\s+-h\b`, "Checks memory with free -h"), m(String.raw`^\s*df\s+-h\b`, "Checks disk space with df -h"), m(String.raw`^\s*ps\s+(aux|-eo\s+\S+)\s+--sort=-%mem\s*\|\s*head`, "Lists top memory users with ps --sort=-%mem | head"), m(String.raw`^\s*top\s+-b\s+-n\s*1\s*\|\s*head`, "Takes a batch top snapshot")]),

    ruleQ({
      title: "Write a systemd unit file",
      brief: "Write /etc/systemd/system/orders.service so systemd runs a Node.js API as a proper service.",
      steps: ["[Unit] with a Description and After=network.target", "[Service] running as User=deploy in WorkingDirectory=/opt/orders", "ExecStart with the full path /usr/bin/node and server.js", "Restart=on-failure and Environment=NODE_ENV=production", "[Install] with WantedBy=multi-user.target"],
      level: "advanced",
      editor: "text",
      starter: `[Unit]

[Service]

[Install]
`,
      solution: `[Unit]
Description=Orders API
After=network.target

[Service]
User=deploy
WorkingDirectory=/opt/orders
ExecStart=/usr/bin/node server.js
Restart=on-failure
Environment=NODE_ENV=production

[Install]
WantedBy=multi-user.target
`,
      rules: [
        m(String.raw`^\[Unit\][\s\S]*^Description=\S`, "Has a [Unit] section with a Description"),
        m(String.raw`^After=network(-online)?\.target\s*$`, "Starts after the network"),
        m(String.raw`^\[Service\][\s\S]*^User=deploy\s*$`, "Runs as the deploy user, not root"),
        m(String.raw`^WorkingDirectory=/opt/orders\s*$`, "Sets the working directory"),
        m(String.raw`^ExecStart=/usr/bin/node\s+(/opt/orders/)?server\.js\s*$`, "ExecStart uses the full path to node"),
        m(String.raw`^Restart=(on-failure|always)\s*$`, "Restarts the app when it crashes"),
        m(String.raw`^Environment="?NODE_ENV=production"?\s*$`, "Sets NODE_ENV=production"),
        m(String.raw`^\[Install\][\s\S]*^WantedBy=multi-user\.target\s*$`, "Is wanted by multi-user.target so enable works"),
      ],
    }),

    bq("Signal number to name", "Read a signal number and print its name. Know these: 1 SIGHUP, 2 SIGINT, 3 SIGQUIT, 9 SIGKILL, 15 SIGTERM, 19 SIGSTOP. For anything else print unknown.", ["Input: a number", "Output: the signal name or unknown", "Use a case statement"], sh`#!/bin/bash
read -r n
case "$n" in
    1) echo "SIGHUP" ;;
    2) echo "SIGINT" ;;
    3) echo "SIGQUIT" ;;
    9) echo "SIGKILL" ;;
    15) echo "SIGTERM" ;;
    19) echo "SIGSTOP" ;;
    *) echo "unknown" ;;
esac
`, [["9", "SIGKILL"], ["15", "SIGTERM"]], [["1", "SIGHUP"], ["2", "SIGINT"], ["42", "unknown"]], { rules: [{ match: String.raw`\bcase\b[\s\S]*\besac\b`, message: "Uses case ... esac" }] }),

    bq("Explain an exit status", "Read the exit status of a command and explain it: 0 success, 1 general error, 2 misuse of a shell command, 126 not executable, 127 command not found, 128 to 255 killed by signal N (N = status - 128), anything else error N.", ["Input: a number from 0 to 255", "Output: one of: success, general error, misuse, not executable, command not found, killed by signal N, error N"], sh`#!/bin/bash
read -r code
if [ "$code" -eq 0 ]; then
    echo "success"
elif [ "$code" -eq 1 ]; then
    echo "general error"
elif [ "$code" -eq 2 ]; then
    echo "misuse"
elif [ "$code" -eq 126 ]; then
    echo "not executable"
elif [ "$code" -eq 127 ]; then
    echo "command not found"
elif [ "$code" -ge 128 ]; then
    echo "killed by signal $((code - 128))"
else
    echo "error $code"
fi
`, [["0", "success"], ["137", "killed by signal 9"]], [["127", "command not found"], ["130", "killed by signal 2"], ["3", "error 3"], ["126", "not executable"]], { level: "intermediate" }),

    bq("Biggest memory user", "The input is ps aux style output with a header: USER PID %CPU %MEM COMMAND. Print the PID and command of the process with the highest %MEM (the first one if tied).", ["Input: a header line, then one process per line", "Output: PID command"], sh`#!/bin/bash
awk 'NR > 1 && (best == "" || $4 > max) { max = $4; best = $2 " " $5 } END { print best }'
`, [["USER PID %CPU %MEM COMMAND\nroot 1 0.0 0.1 systemd\nasha 2210 12.5 35.2 node\nmysql 880 3.1 20.4 mysqld\n", "2210 node"]], [["USER PID %CPU %MEM COMMAND\nwww 10 1.0 2.5 nginx\n", "10 nginx"], ["USER PID %CPU %MEM COMMAND\na 5 0 9.5 java\nb 6 0 10.25 python3\nc 7 0 10.25 ruby\n", "6 python3"]], { level: "intermediate" }),

    bq("Processes per user", "The input is a list of process owners, one per line (like ps -eo user --no-headers). Print each user and how many processes they run, most first, ties in alphabetical order.", ["Input: one user name per line", "Output: user count lines", exactOut], sh`#!/bin/bash
sort | uniq -c | sort -k1,1nr -k2,2 | awk '{ print $2, $1 }'
`, [["root\nasha\nroot\nwww-data\nroot\nasha\n", "root 3\nasha 2\nwww-data 1"]], [["deploy\n", "deploy 1"], ["b\na\nc\nb\na\n", "a 2\nb 2\nc 1"]], { level: "intermediate", match: "exact" }),

    bq("Is the server overloaded?", "Read a line of uptime output and the number of CPU cores. Print overloaded if the 1-minute load average is greater than the number of cores, otherwise ok.", ["Input line 1: uptime output ending in load average: a, b, c", "Input line 2: the number of cores", "Output: ok or overloaded"], sh`#!/bin/bash
read -r line
read -r cores
load="$\{line##*load average: }"
load="$\{load%%,*}"
if awk -v l="$load" -v c="$cores" 'BEGIN { exit !(l > c) }'; then
    echo "overloaded"
else
    echo "ok"
fi
`, [[" 10:15:01 up 12 days,  3:04,  2 users,  load average: 5.20, 3.10, 2.00\n4", "overloaded"], [" 09:00:00 up 1 day,  1:00,  1 user,  load average: 0.35, 0.40, 0.50\n2", "ok"]], [[" 11:00:00 up 3 days,  2 users,  load average: 4.00, 4.10, 4.20\n4", "ok"], [" 12:00:00 up 40 days,  5 users,  load average: 16.75, 12.00, 9.00\n8", "overloaded"]], { level: "advanced", rules: [{ match: String.raw`load average`, message: "Extracts the value after load average" }] }),
  ],
  quiz: [
    { q: "What is a PID?", options: ["A process's number", "A package id", "A port id", "A parent directory"], answer: 0, why: "Every process gets a process ID, which kill and other tools use." },
    { q: "Which signal does kill send when you give no option?", options: ["SIGKILL (9)", "SIGTERM (15)", "SIGHUP (1)", "SIGINT (2)"], answer: 1, why: "The default is SIGTERM, a request to shut down cleanly." },
    { q: "What is the difference between systemctl start and systemctl enable?", options: ["They are the same", "start runs it now; enable makes it start at boot", "enable runs it now; start makes it start at boot", "enable restarts it"], answer: 1, why: "enable only sets up boot-time start; use enable --now to do both." },
    { q: "Which command shows the logs of the nginx service?", options: ["systemctl logs nginx", "journalctl -u nginx", "tail nginx", "ps nginx"], answer: 1, why: "journalctl -u filters the systemd journal by unit." },
    { q: "What does Ctrl+Z do to a running command?", options: ["Kills it", "Pauses (stops) it so you can bg or fg it", "Sends it to a new terminal", "Saves its output"], answer: 1, why: "Ctrl+Z sends SIGTSTP; the job is paused until bg or fg." },
    { q: "After editing /etc/systemd/system/orders.service, what must you run before restarting it?", options: ["systemctl reload orders", "sudo systemctl daemon-reload", "journalctl --flush", "reboot"], answer: 1, why: "daemon-reload makes systemd re-read unit files." },
    { q: "A 4-core server shows load average: 7.90, 7.50, 6.80. What does it mean?", options: ["The server is idle", "About twice as much work as the CPUs can handle is running or waiting", "7.9% CPU is used", "7 users are logged in"], answer: 1, why: "A load near 8 on 4 cores means work is queuing for CPU (or waiting on disk)." },
    { q: "Why is kill -9 a last resort?", options: ["It needs root", "The process cannot clean up: open files, temp data and connections are left as they are", "It restarts the process", "It only works on services"], answer: 1, why: "SIGKILL cannot be caught, so the app gets no chance to shut down properly." },
    { q: "A container's process exits with status 137. What most likely happened?", options: ["The command was not found", "It was killed with SIGKILL, often by the out-of-memory killer", "It exited normally", "It was not executable"], answer: 1, why: "137 = 128 + 9, which means it was killed by SIGKILL." },
    { q: "Your app runs with nohup ./app & and it stops after the server reboots. What is the proper fix?", options: ["Use kill -9 less", "Add a systemd unit with Restart=on-failure and enable it", "Run it with sudo", "Add & twice"], answer: 1, why: "systemd starts enabled services at boot and restarts them on failure; nohup does neither." },
  ],
};
