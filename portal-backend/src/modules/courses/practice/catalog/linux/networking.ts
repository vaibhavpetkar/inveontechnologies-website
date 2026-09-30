import { ruleQ } from "../../author.js";
import type { PracticeUnit } from "../../types.js";
import { bq, exactOut, m, not, sh, sq } from "./shared.js";

export const networking: PracticeUnit = {
  key: "networking",
  title: "Networking, SSH and packages",
  summary: "IP addresses and ports, ping, curl, ss, SSH keys, scp and rsync, ~/.ssh/config, apt and the ufw firewall",
  reading: sh`## Addresses and ports

Every machine on a network has an IP address, such as 192.168.1.20 on a home network or 203.0.113.10 on the internet. An IPv4 address is four numbers from 0 to 255. A port picks one program on that machine: the same server can run SSH on 22, a website on 80 and 443, and PostgreSQL on 5432. 127.0.0.1 (localhost) is the machine itself, and a service listening on 0.0.0.0 accepts connections on every network interface.

Ports worth knowing: 22 SSH, 80 HTTP, 443 HTTPS, 3306 MySQL, 5432 PostgreSQL, 6379 Redis, 27017 MongoDB, 3000/8000/8080 common app ports.

## Is it reachable?

` + "```bash" + sh`
ip a                              # this machine's addresses (ifconfig on old systems)
ping -c 4 google.com              # 4 packets; can we reach it at all?
curl -I https://example.com       # only the response headers
curl -s http://localhost:8080/health
curl -X POST -H "Content-Type: application/json" -d '{"name":"asha"}' http://localhost:3000/users
dig example.com +short            # DNS lookup (nslookup works too)
ss -tlnp                          # TCP ports that are listening, with the program
sudo lsof -i :3000                # who is using port 3000
` + "```" + sh`

A good debugging order: DNS (does the name resolve?), network (ping, though many clouds block it), port (is anything listening, is the firewall open?), then the app (curl the health URL and read the logs).

## SSH: logging into servers

SSH gives you an encrypted shell on another machine. Keys are safer and easier than passwords:

` + "```bash" + sh`
ssh-keygen -t ed25519 -C "asha@example.com"   # creates ~/.ssh/id_ed25519 and id_ed25519.pub
ssh-copy-id ubuntu@203.0.113.10                # puts the public key on the server
ssh ubuntu@203.0.113.10
ssh -i ~/keys/aws-prod.pem ec2-user@203.0.113.25
ssh -p 2222 deploy@example.com                 # a non-standard port
` + "```" + sh`

The private key never leaves your laptop, needs mode 600, and should have a passphrase. The server keeps your public key in ~/.ssh/authorized_keys. On a new server, turn off password logins (PasswordAuthentication no in /etc/ssh/sshd_config) once key login works.

Save typing with ~/.ssh/config:

` + "```text" + sh`
Host prod
    HostName 203.0.113.10
    User deploy
    Port 22
    IdentityFile ~/.ssh/id_ed25519
` + "```" + sh`

Now ssh prod is enough, and scp and rsync understand prod too.

## Copying files: scp and rsync

` + "```bash" + sh`
scp app.tar.gz ubuntu@203.0.113.10:/tmp/          # upload
scp ubuntu@203.0.113.10:/var/log/syslog ./        # download
scp -r ./dist prod:/var/www/site                  # a directory
rsync -avz --delete ./dist/ prod:/var/www/site/   # sync only what changed
` + "```" + sh`

rsync is better for deployments and big folders: it sends only differences and can resume. The trailing slash on ./dist/ means "the contents of dist".

## Installing software with apt

Debian and Ubuntu use apt (RHEL, Rocky and Amazon Linux use dnf or yum):

` + "```bash" + sh`
sudo apt update                    # refresh the package lists (do this first)
sudo apt install -y nginx git      # install; -y answers yes
sudo apt upgrade -y                # upgrade installed packages
apt list --installed | grep nginx
apt show nginx                     # details and version
sudo apt remove nginx              # remove (purge also deletes config)
sudo apt autoremove                # remove unused dependencies
` + "```" + sh`

apt install without apt update can fail with "Unable to locate package" or install old versions. In scripts and Dockerfiles always add -y.

## The firewall: ufw

` + "```bash" + sh`
sudo ufw allow OpenSSH       # allow SSH FIRST, or you lock yourself out
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp
sudo ufw enable
sudo ufw status verbose
` + "```" + sh`

On cloud servers there is often a second firewall outside the machine (an AWS security group, for example), and both must allow the port.

## How these assignments are checked

SSH, scp, apt and ufw commands change real machines, so those sheets are rule-checked: each rule looks for the right command, options and target. Questions that validate addresses, map ports or parse ss output are bash scripts run with hidden inputs.`,
  questions: [
    sq("Log in with SSH keys", "Set up key-based login to a new server at 203.0.113.10 where the user is ubuntu.", ["Create an ed25519 key pair with your email as the comment", "Copy the public key to the server with ssh-copy-id", "Log in with ssh", "Also show how to log in to 203.0.113.25 as ec2-user with the key file ~/keys/aws-prod.pem"], sh`#!/bin/bash
ssh-keygen -t ed25519 -C "asha@example.com"
ssh-copy-id ubuntu@203.0.113.10
ssh ubuntu@203.0.113.10
ssh -i ~/keys/aws-prod.pem ec2-user@203.0.113.25
`, [m(String.raw`^\s*ssh-keygen\s+(?=.*-t\s+ed25519)(?=.*-C\s+["']?\S+@).*$`, "Creates an ed25519 key with -C"), m(String.raw`^\s*ssh-copy-id\s+(-i\s+\S+\s+)?ubuntu@203\.0\.113\.10\s*$`, "Copies the key with ssh-copy-id"), m(String.raw`^\s*ssh\s+ubuntu@203\.0\.113\.10\s*$`, "Logs in with ssh"), m(String.raw`^\s*ssh\s+-i\s+~/keys/aws-prod\.pem\s+ec2-user@203\.0\.113\.25\s*$`, "Uses -i for the .pem key"), not(String.raw`sshpass|-o\s+PasswordAuthentication=yes`, "Does not put passwords in commands")]),

    sq("Copy files to and from a server", "Move files between your laptop and the server prod (defined in your SSH config).", ["Upload release.tar.gz to /tmp on prod with scp", "Download /var/log/nginx/error.log from prod into the current directory", "Upload the whole ./dist directory to /var/www/site on prod with scp", "Sync the contents of ./dist/ to /var/www/site/ with rsync (archive, verbose, compress, delete removed files)"], sh`#!/bin/bash
scp release.tar.gz prod:/tmp/
scp prod:/var/log/nginx/error.log .
scp -r ./dist prod:/var/www/site
rsync -avz --delete ./dist/ prod:/var/www/site/
`, [m(String.raw`^\s*scp\s+release\.tar\.gz\s+prod:/tmp/?\s*$`, "Uploads the archive with scp"), m(String.raw`^\s*scp\s+prod:/var/log/nginx/error\.log\s+\./?\s*$`, "Downloads error.log to the current directory"), m(String.raw`^\s*scp\s+-r\s+(\./)?dist/?\s+prod:/var/www/site/?\s*$`, "Uploads a directory with scp -r"), m(String.raw`^\s*rsync\s+-(avz|azv|vaz|zav)\s+--delete\s+(\./)?dist/\s+prod:/var/www/site/`, "Syncs with rsync -avz --delete")], { level: "intermediate" }),

    ruleQ({
      title: "Write an SSH config entry",
      brief: "Write a ~/.ssh/config file so that ssh prod logs in to 203.0.113.10 as deploy on port 2222 with your ed25519 key, and ssh staging logs in to 203.0.113.20 as deploy.",
      steps: ["A Host prod block with HostName, User, Port 2222 and IdentityFile ~/.ssh/id_ed25519", "A Host staging block with HostName 203.0.113.20 and User deploy", "Indent the settings under each Host"],
      level: "intermediate",
      editor: "text",
      starter: "Host prod\n",
      solution: `Host prod
    HostName 203.0.113.10
    User deploy
    Port 2222
    IdentityFile ~/.ssh/id_ed25519

Host staging
    HostName 203.0.113.20
    User deploy
    IdentityFile ~/.ssh/id_ed25519
`,
      rules: [
        m(String.raw`^Host\s+prod\s*$\n(\s+\S.*\n)*?\s+HostName\s+203\.0\.113\.10\s*$`, "prod points at 203.0.113.10"),
        m(String.raw`^Host\s+prod\s*$\n(\s+\S.*\n)*?\s+Port\s+2222\s*$`, "prod uses port 2222"),
        m(String.raw`^Host\s+prod\s*$\n(\s+\S.*\n)*?\s+IdentityFile\s+~/\.ssh/id_ed25519\s*$`, "prod uses the ed25519 key"),
        m(String.raw`^Host\s+staging\s*$\n(\s+\S.*\n)*?\s+HostName\s+203\.0\.113\.20\s*$`, "staging points at 203.0.113.20"),
        m(String.raw`^\s+User\s+deploy\s*$[\s\S]*^\s+User\s+deploy\s*$`, "Both hosts log in as deploy"),
      ],
    }),

    sq("Check a service over the network", "Your API on this server should answer on port 8080. Write the commands to check each layer.", ["Resolve api.example.com with dig (short output)", "Ping 8.8.8.8 exactly 3 times", "List listening TCP ports with the program names (ss)", "Show which process uses port 8080 with lsof", "Request http://localhost:8080/health showing only the response headers (curl -I)"], sh`#!/bin/bash
dig api.example.com +short
ping -c 3 8.8.8.8
sudo ss -tlnp
sudo lsof -i :8080
curl -I http://localhost:8080/health
`, [m(String.raw`^\s*(dig\s+(\+short\s+)?api\.example\.com|nslookup\s+api\.example\.com)`, "Looks up the name with dig"), m(String.raw`^\s*ping\s+-c\s*3\s+8\.8\.8\.8\s*$`, "Pings 3 times with -c 3"), m(String.raw`^\s*(sudo\s+)?ss\s+-(tlnp|tlpn|lntp|ltnp|plnt|tnlp)\b`, "Lists listening TCP ports with ss -tlnp"), m(String.raw`^\s*(sudo\s+)?lsof\s+-i\s*:8080\s*$`, "Finds the process on port 8080"), m(String.raw`^\s*curl\s+-I\s+http://localhost:8080/health\s*$`, "Fetches only the headers with curl -I")]),

    sq("Install and update packages", "Set up a fresh Ubuntu server with apt.", ["Refresh the package lists", "Install nginx, git and curl in one command without being asked to confirm", "Upgrade all installed packages without confirmation", "Show details of the nginx package", "Remove packages that are no longer needed"], sh`#!/bin/bash
sudo apt update
sudo apt install -y nginx git curl
sudo apt upgrade -y
apt show nginx
sudo apt autoremove -y
`, [m(String.raw`^\s*sudo\s+apt(-get)?\s+update\s*$`, "Runs apt update first"), m(String.raw`^\s*sudo\s+apt(-get)?\s+install(?=.*\s-y\b)\s+(?=.*\bnginx\b)(?=.*\bgit\b)(?=.*\bcurl\b)`, "Installs nginx, git and curl with -y"), m(String.raw`^\s*sudo\s+apt(-get)?\s+upgrade\s+-y\s*$|^\s*sudo\s+apt(-get)?\s+-y\s+upgrade\s*$`, "Upgrades with -y"), m(String.raw`^\s*apt(-cache)?\s+show\s+nginx\s*$`, "Shows the package details"), m(String.raw`^\s*sudo\s+apt(-get)?\s+autoremove\b`, "Removes unused packages with autoremove"), m(String.raw`apt(-get)?\s+update[\s\S]*apt(-get)?\s+install`, "Updates before installing")]),

    sq("Open the firewall safely", "Turn on ufw on a web server without locking yourself out.", ["Allow SSH before anything else (OpenSSH or 22/tcp)", "Allow 80/tcp and 443/tcp", "Enable the firewall", "Show the status in verbose mode"], sh`#!/bin/bash
sudo ufw allow OpenSSH
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp
sudo ufw enable
sudo ufw status verbose
`, [m(String.raw`^\s*sudo\s+ufw\s+allow\s+(OpenSSH|22(/tcp)?|ssh)\s*$`, "Allows SSH"), m(String.raw`^\s*sudo\s+ufw\s+allow\s+80(/tcp)?\s*$`, "Allows HTTP"), m(String.raw`^\s*sudo\s+ufw\s+allow\s+443(/tcp)?\s*$`, "Allows HTTPS"), m(String.raw`ufw\s+allow\s+(OpenSSH|22(/tcp)?|ssh)\s*$[\s\S]*ufw\s+enable`, "Allows SSH before enabling (so you are not locked out)"), m(String.raw`^\s*sudo\s+ufw\s+status\s+verbose\s*$`, "Shows the verbose status")], { level: "intermediate" }),

    bq("Well-known port", "Read a port number and print the service that normally uses it: 22 ssh, 80 http, 443 https, 3306 mysql, 5432 postgresql, 6379 redis, 27017 mongodb. Otherwise print unknown.", ["Input: a port number", "Output: the service name or unknown"], sh`#!/bin/bash
read -r port
case "$port" in
    22) echo "ssh" ;;
    80) echo "http" ;;
    443) echo "https" ;;
    3306) echo "mysql" ;;
    5432) echo "postgresql" ;;
    6379) echo "redis" ;;
    27017) echo "mongodb" ;;
    *) echo "unknown" ;;
esac
`, [["22", "ssh"], ["5432", "postgresql"]], [["443", "https"], ["27017", "mongodb"], ["8080", "unknown"]]),

    bq("Valid IPv4 address", "Read a string and print valid if it is an IPv4 address (four numbers from 0 to 255 separated by dots, nothing else), otherwise invalid.", ["Input: one string", "Output: valid or invalid"], sh`#!/bin/bash
read -r ip
result="valid"
if [[ ! "$ip" =~ ^[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}$ ]]; then
    result="invalid"
else
    IFS='.' read -ra parts <<< "$ip"
    for p in "$\{parts[@]}"; do
        if (( 10#$p > 255 )); then
            result="invalid"
        fi
    done
fi
echo "$result"
`, [["192.168.1.20", "valid"], ["256.1.1.1", "invalid"]], [["10.0.0", "invalid"], ["0.0.0.0", "valid"], ["1.2.3.4.5", "invalid"], ["a.b.c.d", "invalid"], ["255.255.255.255", "valid"]], { level: "intermediate", rules: [{ match: String.raw`=~`, message: "Uses a regular expression with =~" }] }),

    bq("Listening ports from ss", "The input is the output of ss -tln. Print the distinct local port numbers that are listening, in increasing order.", ["Input: a header line, then lines whose 4th field is the local address:port (for example 0.0.0.0:22 or [::]:80)", "Output: one port per line, sorted numerically, no duplicates", exactOut], sh`#!/bin/bash
awk 'NR > 1 { n = split($4, a, ":"); print a[n] }' | sort -n -u
`, [["State  Recv-Q Send-Q Local Address:Port Peer Address:Port\nLISTEN 0 128 0.0.0.0:22 0.0.0.0:*\nLISTEN 0 511 0.0.0.0:80 0.0.0.0:*\nLISTEN 0 128 [::]:22 [::]:*\nLISTEN 0 244 127.0.0.1:5432 0.0.0.0:*\n", "22\n80\n5432"]], [["State Recv-Q Send-Q Local Address:Port Peer Address:Port\nLISTEN 0 511 *:3000 *:*\n", "3000"], ["State Recv-Q Send-Q Local Address:Port Peer Address:Port\nLISTEN 0 5 127.0.0.1:8080 0.0.0.0:*\nLISTEN 0 5 [::1]:443 [::]:*\nLISTEN 0 5 0.0.0.0:443 0.0.0.0:*\nLISTEN 0 5 0.0.0.0:9000 0.0.0.0:*\n", "443\n8080\n9000"]], { level: "intermediate", match: "exact" }),

    bq("Split a URL", "Read a URL of the form scheme://host[:port][/path] and print its parts. If there is no port use 80 for http and 443 for https; if there is no path use /.", ["Input: one URL (http or https)", "Output: four lines: scheme, host, port, path", exactOut], sh`#!/bin/bash
read -r url
scheme="$\{url%%://*}"
rest="$\{url#*://}"
hostport="$\{rest%%/*}"
if [[ "$rest" == */* ]]; then
    path="/$\{rest#*/}"
else
    path="/"
fi
host="$\{hostport%%:*}"
if [[ "$hostport" == *:* ]]; then
    port="$\{hostport##*:}"
elif [ "$scheme" = "https" ]; then
    port=443
else
    port=80
fi
echo "$scheme"
echo "$host"
echo "$port"
echo "$path"
`, [["https://api.example.com:8443/v1/users", "https\napi.example.com\n8443\n/v1/users"], ["http://localhost/health", "http\nlocalhost\n80\n/health"]], [["https://example.com", "https\nexample.com\n443\n/"], ["http://10.0.0.5:3000/", "http\n10.0.0.5\n3000\n/"], ["https://shop.in/cart/items/7", "https\nshop.in\n443\n/cart/items/7"]], { level: "advanced", match: "exact" }),
  ],
  quiz: [
    { q: "Which port does HTTPS use by default?", options: ["80", "22", "443", "8080"], answer: 2, why: "HTTP is 80, HTTPS is 443, SSH is 22." },
    { q: "What does ssh-copy-id do?", options: ["Copies your private key to the server", "Appends your public key to the server's ~/.ssh/authorized_keys", "Copies files like scp", "Creates a new key pair"], answer: 1, why: "It installs the public key so you can log in with the matching private key." },
    { q: "Which file on the server lists the public keys allowed to log in as a user?", options: ["~/.ssh/known_hosts", "~/.ssh/config", "~/.ssh/authorized_keys", "/etc/hosts"], answer: 2, why: "authorized_keys holds allowed public keys; known_hosts on your laptop remembers server fingerprints." },
    { q: "Why run sudo apt update before apt install?", options: ["It upgrades every package", "It refreshes the list of available packages and versions", "It is only needed once per year", "It removes old packages"], answer: 1, why: "update downloads fresh package indexes; without it apt may not find the package or pick old versions." },
    { q: "What does curl -I https://example.com show?", options: ["Only the response headers", "The page's images", "The IP address", "Nothing, -I is invalid"], answer: 0, why: "-I sends a HEAD request and prints the status line and headers." },
    { q: "Which command lists TCP ports that are listening, with the owning program?", options: ["ping -l", "ss -tlnp", "curl -p", "ip route"], answer: 1, why: "ss -t (TCP) -l (listening) -n (numbers) -p (process)." },
    { q: "What does 127.0.0.1:5432 in a listening socket tell you?", options: ["PostgreSQL accepts connections from anywhere", "It accepts connections only from the same machine", "The port is closed", "It is an IPv6 address"], answer: 1, why: "Bound to localhost, the service is not reachable from other machines." },
    { q: "In rsync -avz ./dist/ prod:/var/www/site/, what does the trailing slash on ./dist/ mean?", options: ["Nothing", "Copy the contents of dist, not the dist folder itself", "Delete dist after copying", "Only copy hidden files"], answer: 1, why: "With the slash rsync copies what is inside dist; without it you get /var/www/site/dist." },
    { q: "You run sudo ufw enable on a remote server before allowing SSH. What happens?", options: ["Nothing, SSH is always allowed", "New SSH connections are blocked and you can lock yourself out", "ufw refuses to start", "Only port 80 is blocked"], answer: 1, why: "ufw denies incoming traffic by default, so allow OpenSSH first." },
    { q: "curl http://server:8080 says Connection refused, but ping works. What is most likely?", options: ["DNS is broken", "The network is down", "Nothing is listening on port 8080 (or it listens only on 127.0.0.1)", "The server is out of disk"], answer: 2, why: "Refused means the machine answered but no program accepted on that address and port." },
  ],
};
