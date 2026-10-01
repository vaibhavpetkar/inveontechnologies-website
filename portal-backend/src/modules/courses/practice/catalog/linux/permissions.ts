import type { PracticeUnit } from "../../types.js";
import { bq, exactOut, m, not, sh, sq } from "./shared.js";

const no777 = not(String.raw`chmod\s+(-R\s+)?0?777`, "Does not use chmod 777");

export const permissions: PracticeUnit = {
  key: "permissions",
  title: "Permissions, users and sudo",
  summary: "read, write and execute bits, chmod in symbolic and octal form, chown, groups, users, sudo and umask",
  reading: sh`## Who can do what

Every file belongs to one user (the owner) and one group. Linux keeps three sets of permissions for each file: for the owner (u), for members of the group (g) and for everyone else (o). Each set has three bits:

- r (read): read a file; list a directory's names.
- w (write): change a file; create, rename or delete entries in a directory.
- x (execute): run a file as a program; enter a directory with cd.

ls -l shows them as ten characters:

` + "```text" + sh`
-rwxr-x---  1 asha devs  2048 Jan 10 09:00 deploy.sh
drwxr-xr-x  3 asha devs  4096 Jan 10 09:00 src
` + "```" + sh`

The first character is the type (- file, d directory, l link). Then rwx for the owner asha, r-x for the group devs, and --- for others. So asha can edit and run deploy.sh, devs can read and run it, and nobody else can touch it.

## chmod: octal and symbolic

Each bit has a value: r = 4, w = 2, x = 1. Add them for each set:

- 7 = rwx, 6 = rw-, 5 = r-x, 4 = r--, 0 = ---.
- 755: rwxr-xr-x, the normal mode for scripts and directories.
- 644: rw-r--r--, the normal mode for files like HTML or config.
- 600: rw-------, private files such as SSH keys and .env files.
- 700: rwx------, a private directory like ~/.ssh.

` + "```bash" + sh`
chmod 755 deploy.sh
chmod u+x run.sh          # add execute for the owner
chmod g-w,o-rwx secret.txt
chmod -R g+rX shared/     # X: execute only on directories (and files already executable)
` + "```" + sh`

chmod 777 gives everyone full control. It "fixes" permission errors by removing all security, and on a server it lets any compromised process change your files. Find the real owner or group problem instead.

## chown and groups

` + "```bash" + sh`
sudo chown asha report.txt             # change the owner
sudo chown asha:devs report.txt        # owner and group
sudo chown -R www-data:www-data /var/www/html
sudo chgrp devs shared/                # group only
groups asha                            # which groups asha is in
id asha                                # uid, gid and groups
` + "```" + sh`

Only root can give a file away to another user, which is why chown usually needs sudo.

## Users and sudo

- sudo useradd -m -s /bin/bash deploy creates a user with a home directory and bash as the shell (adduser deploy is the friendlier Debian/Ubuntu version).
- sudo passwd deploy sets the password.
- sudo usermod -aG docker deploy adds deploy to the docker group. The -a (append) matters: without it, -G replaces all of the user's other groups.
- Group changes apply at the next login.
- sudo runs one command as root and logs it; sudo -i or sudo su - opens a root shell. Prefer sudo per command so mistakes are smaller and everything is audited.
- User accounts live in /etc/passwd (name:x:uid:gid:comment:home:shell), passwords as hashes in /etc/shadow, groups in /etc/group.

## Default permissions: umask

New files start from 666 and new directories from 777, and the umask removes bits. With the common umask 022, files become 644 and directories 755. With 077, files become 600 and directories 700.

## Special bits (good to know)

- setgid on a directory (chmod 2775 shared/) makes new files inherit the directory's group, which is ideal for team folders.
- The sticky bit on /tmp (drwxrwxrwt) means users can only delete their own files.
- setuid on a program (like passwd) runs it as its owner.

## Common mistakes

- A script says "Permission denied": it needs chmod +x, or run it with bash script.sh.
- ssh refuses your key with "UNPROTECTED PRIVATE KEY FILE": chmod 600 the key.
- usermod -G without -a silently removes the user from sudo.

## How these assignments are checked

Command sheets are checked by rules that look for the right command and mode on the right file (and chmod 777 is treated as wrong). Scripts that convert or check permissions are run with bash against hidden inputs; print only what the question asks for.`,
  questions: [
    sq("Protect your SSH keys", "ssh refuses to use your private key because its permissions are too open. Write the commands to fix ~/.ssh.", ["Make the ~/.ssh directory accessible only to you (700)", "Make the private key ~/.ssh/id_ed25519 readable and writable only by you (600)", "Make the public key ~/.ssh/id_ed25519.pub 644", "Show the long listing of ~/.ssh to confirm"], sh`#!/bin/bash
chmod 700 ~/.ssh
chmod 600 ~/.ssh/id_ed25519
chmod 644 ~/.ssh/id_ed25519.pub
ls -l ~/.ssh
`, [m(String.raw`^\s*chmod\s+(700|u=rwx,go=)\s+~/\.ssh/?\s*$`, "Sets ~/.ssh to 700"), m(String.raw`^\s*chmod\s+(600|u=rw,go=)\s+~/\.ssh/id_ed25519\s*$`, "Sets the private key to 600"), m(String.raw`^\s*chmod\s+644\s+~/\.ssh/id_ed25519\.pub\s*$`, "Sets the public key to 644"), m(String.raw`^\s*ls\s+-l[a-z]*\s+~/\.ssh`, "Lists ~/.ssh in long format"), no777]),

    sq("Create a deploy user", "Write the commands an admin runs to create a user named deploy that can use sudo and docker.", ["Create the user with a home directory and /bin/bash as the login shell (useradd)", "Set the user's password", "Add deploy to the sudo and docker groups without removing its other groups", "Show the user's uid and groups"], sh`#!/bin/bash
sudo useradd -m -s /bin/bash deploy
sudo passwd deploy
sudo usermod -aG sudo,docker deploy
id deploy
`, [m(String.raw`^\s*sudo\s+useradd\b(?=.*\s-m\b)(?=.*\s-s\s+/bin/bash\b).*\sdeploy\s*$`, "Creates deploy with -m and -s /bin/bash"), m(String.raw`^\s*sudo\s+passwd\s+deploy\s*$`, "Sets the password with passwd"), m(String.raw`^\s*sudo\s+usermod\s+-aG\s+\S*\bsudo\b`, "Adds the sudo group with usermod -aG"), m(String.raw`^\s*sudo\s+usermod\s+-aG\s+\S*\bdocker\b`, "Adds the docker group with usermod -aG"), m(String.raw`^\s*(id|groups)\s+deploy\s*$`, "Checks the user with id (or groups)"), not(String.raw`usermod\s+-G\b`, "Never uses usermod -G without -a")], { level: "intermediate" }),

    sq("Set up a shared team folder", "The devs team needs a folder /srv/shared where everyone in the group can create and edit files, and new files keep the devs group.", ["Create the group devs", "Add the users asha and ravi to it (append, one command per user)", "Create /srv/shared", "Give the folder to root as owner and devs as group", "Set mode 2775 (group can write, setgid keeps the group on new files)"], sh`#!/bin/bash
sudo groupadd devs
sudo usermod -aG devs asha
sudo usermod -aG devs ravi
sudo mkdir -p /srv/shared
sudo chown root:devs /srv/shared
sudo chmod 2775 /srv/shared
`, [m(String.raw`^\s*sudo\s+groupadd\s+devs\s*$`, "Creates the devs group"), m(String.raw`^\s*sudo\s+usermod\s+-aG\s+devs\s+asha\s*$`, "Adds asha to devs"), m(String.raw`^\s*sudo\s+usermod\s+-aG\s+devs\s+ravi\s*$`, "Adds ravi to devs"), m(String.raw`^\s*sudo\s+(chown\s+root:devs|chgrp\s+devs)\s+/srv/shared/?\s*$`, "Sets the group to devs"), m(String.raw`^\s*sudo\s+chmod\s+(2775|g\+s)\s+/srv/shared/?\s*$`, "Sets mode 2775 (setgid)"), no777], { level: "intermediate" }),

    sq("Fix web root permissions", "Your website in /var/www/html shows 403 errors after a copy from a laptop. Nginx runs as www-data. Fix the ownership and permissions the standard way.", ["Make www-data the owner and group of everything under /var/www/html (recursively)", "Set every directory to 755 with find ... -type d -exec", "Set every file to 644 with find ... -type f -exec", "Do not use chmod 777 or chmod -R on everything at once"], sh`#!/bin/bash
sudo chown -R www-data:www-data /var/www/html
sudo find /var/www/html -type d -exec chmod 755 {} \;
sudo find /var/www/html -type f -exec chmod 644 {} \;
`, [m(String.raw`^\s*sudo\s+chown\s+-R\s+www-data:www-data\s+/var/www/html/?\s*$`, "Gives the tree to www-data with chown -R"), m(String.raw`find\s+/var/www/html\s+-type\s+d\s+-exec\s+chmod\s+755\s+\{\}\s+(\\;|\+)`, "Sets directories to 755"), m(String.raw`find\s+/var/www/html\s+-type\s+f\s+-exec\s+chmod\s+644\s+\{\}\s+(\\;|\+)`, "Sets files to 644"), no777, not(String.raw`chmod\s+-R\s+\d+\s+/var/www`, "Does not chmod -R the whole tree with one mode")], { level: "intermediate" }),

    bq("Permission string to octal", "Read a 9-character permission string like rwxr-xr-- and print its octal mode.", ["Input: nine characters made of r, w, x and -", "Output: the three-digit octal mode, for example 754", exactOut], sh`#!/bin/bash
read -r perm
out=""
for start in 0 3 6; do
    part="$\{perm:start:3}"
    v=0
    [[ "$\{part:0:1}" == "r" ]] && v=$((v + 4))
    [[ "$\{part:1:1}" == "w" ]] && v=$((v + 2))
    [[ "$\{part:2:1}" == "x" ]] && v=$((v + 1))
    out="$out$v"
done
echo "$out"
`, [["rwxr-xr--", "754"], ["rw-r--r--", "644"]], [["rw-------", "600"], ["---------", "000"], ["rwxrwxrwx", "777"]], { match: "exact" }),

    bq("Octal to permission string", "Read a three-digit octal mode and print it as a 9-character permission string.", ["Input: a mode like 640", "Output: the string, for example rw-r-----", exactOut], sh`#!/bin/bash
read -r mode
out=""
for ((i = 0; i < 3; i++)); do
    d=$\{mode:i:1}
    (( d & 4 )) && out+="r" || out+="-"
    (( d & 2 )) && out+="w" || out+="-"
    (( d & 1 )) && out+="x" || out+="-"
done
echo "$out"
`, [["640", "rw-r-----"], ["755", "rwxr-xr-x"]], [["700", "rwx------"], ["000", "---------"], ["421", "r---w---x"]], { match: "exact" }),

    bq("Is it allowed?", "Read a permission string, who is asking (owner, group or other) and what they want (read, write or execute), and print yes or no.", ["Input line 1: a 9-character permission string", "Input line 2: owner, group or other", "Input line 3: read, write or execute", "Output: yes or no"], sh`#!/bin/bash
read -r perm
read -r who
read -r action
case "$who" in
    owner) base=0 ;;
    group) base=3 ;;
    *) base=6 ;;
esac
case "$action" in
    read) off=0; want="r" ;;
    write) off=1; want="w" ;;
    *) off=2; want="x" ;;
esac
if [[ "$\{perm:base+off:1}" == "$want" ]]; then
    echo "yes"
else
    echo "no"
fi
`, [["rwxr-x---\ngroup\nexecute", "yes"], ["rw-r--r--\nother\nwrite", "no"]], [["rw-rw-r--\ngroup\nwrite", "yes"], ["rwx------\nother\nread", "no"], ["---------\nowner\nread", "no"]], { level: "intermediate" }),

    bq("What does umask give?", "Read a umask (three octal digits) and print the permissions that new files and new directories get: files start from 666 and directories from 777, and the umask bits are removed.", ["Input: a umask such as 022", "Output: file: XXX dir: XXX (three octal digits each)"], sh`#!/bin/bash
read -r mask
file=$(( 8#666 & ~8#$mask ))
dir=$(( 8#777 & ~8#$mask ))
printf "file: %03o dir: %03o\n" "$file" "$dir"
`, [["022", "file: 644 dir: 755"], ["077", "file: 600 dir: 700"]], [["002", "file: 664 dir: 775"], ["027", "file: 640 dir: 750"], ["000", "file: 666 dir: 777"]], { level: "intermediate", rules: [{ match: String.raw`8#`, message: "Uses octal arithmetic (8#...) in $(( ))" }] }),

    bq("Accounts that can log in", "The input is the contents of /etc/passwd. Print the user names whose login shell is a real shell, meaning it does not end in nologin or false, in the order they appear.", ["Input: lines of name:x:uid:gid:comment:home:shell", "Output: one user name per line", exactOut], sh`#!/bin/bash
awk -F: '$7 !~ /(nologin|false)$/ { print $1 }'
`, [["root:x:0:0:root:/root:/bin/bash\ndaemon:x:1:1:daemon:/usr/sbin:/usr/sbin/nologin\nasha:x:1000:1000:Asha:/home/asha:/bin/bash\nsshd:x:110:65534::/run/sshd:/bin/false\n", "root\nasha"]], [["ravi:x:1001:1001::/home/ravi:/bin/zsh\nwww-data:x:33:33:www-data:/var/www:/usr/sbin/nologin\n", "ravi"], ["om:x:1002:1002::/home/om:/bin/sh\n", "om"]], { level: "intermediate", match: "exact" }),

    bq("Find risky permissions", "The input is ls -l output (without the total line). Print the names of files that anyone (other) can write to, and then a line risky: N with how many there were.", ["Input: ls -l lines; the name is the last field", "Output: each risky name on its own line, then risky: N", exactOut], sh`#!/bin/bash
awk 'substr($1, 9, 1) == "w" { print $NF; n++ } END { printf "risky: %d\n", n }'
`, [["-rw-r--r-- 1 a a 10 Jan 1 10:00 ok.txt\n-rw-rw-rw- 1 a a 10 Jan 1 10:00 open.txt\ndrwxrwxrwx 2 a a 4096 Jan 1 10:00 uploads\n", "open.txt\nuploads\nrisky: 2"]], [["-rwxr-xr-x 1 a a 10 Jan 1 10:00 run.sh\n", "risky: 0"], ["-rw-r---w- 1 a a 5 Jan 1 10:00 odd.log\n", "odd.log\nrisky: 1"]], { level: "advanced", match: "exact" }),
  ],
  quiz: [
    { q: "What does the x bit mean on a directory?", options: ["You can list its names", "You can enter it (cd) and reach files inside", "You can delete it", "Nothing, x only applies to files"], answer: 1, why: "On a directory, x lets you traverse it; r lets you list the names." },
    { q: "Which octal mode is rw-r--r--?", options: ["755", "644", "600", "664"], answer: 1, why: "rw- = 6, r-- = 4, r-- = 4." },
    { q: "Which mode should an SSH private key have?", options: ["644", "755", "600", "777"], answer: 2, why: "ssh refuses keys that others can read; 600 means only the owner can read and write." },
    { q: "What does chmod u+x run.sh do?", options: ["Gives everyone execute", "Gives the owner execute, leaving other bits alone", "Removes execute from the owner", "Sets the mode to 100"], answer: 1, why: "u+x adds the execute bit for the user (owner) only." },
    { q: "Why does chown usually need sudo?", options: ["It is a network command", "Only root can give files to another user", "It changes the kernel", "It edits /etc/shadow"], answer: 1, why: "Normal users cannot give their files away, so changing the owner requires root." },
    { q: "Where are users' password hashes stored?", options: ["/etc/passwd", "/etc/shadow", "/etc/group", "/home/user/.password"], answer: 1, why: "/etc/passwd is world-readable, so the hashes live in /etc/shadow, readable only by root." },
    { q: "With umask 027, what mode does a new directory get?", options: ["750", "755", "640", "027"], answer: 0, why: "777 with the 027 bits removed is 750." },
    { q: "What happens after sudo usermod -G docker asha (without -a)?", options: ["asha is added to docker and keeps her other groups", "asha's supplementary groups are replaced by just docker, so she can lose sudo", "Nothing until reboot", "It fails with an error"], answer: 1, why: "-G sets the list; only -aG appends to it." },
    { q: "A folder has mode 2775 and group devs. What does the 2 do?", options: ["Makes it read-only", "New files created inside get the devs group", "Only the owner can delete files", "Runs files as root"], answer: 1, why: "The setgid bit on a directory makes new entries inherit the directory's group." },
    { q: "A file is -rw-r----- owned by asha:devs. Ravi is in devs but is not asha. Which is true?", options: ["Ravi can read and write it", "Ravi can read it but not write it", "Ravi cannot read it", "Ravi can execute it"], answer: 1, why: "Ravi falls in the group set, r--, so he can only read." },
  ],
};
