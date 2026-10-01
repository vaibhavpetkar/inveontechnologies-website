import type { PracticeUnit } from "../../types.js";
import { bq, exactOut, m, not, sh, sq } from "./shared.js";

export const files: PracticeUnit = {
  key: "files",
  title: "The file system and navigation",
  summary: "the Linux directory tree, absolute and relative paths, ls, cd, pwd, mkdir, cp, mv, rm and find",
  reading: sh`## Everything is a file in one tree

Linux has a single directory tree that starts at the root, written as a single slash: /. There are no drive letters like C: or D:. Disks, USB drives and network shares are all mounted somewhere inside this one tree.

- /home: one folder per user, for example /home/asha. Your home is also written as ~.
- /etc: system configuration files (nginx, ssh, users).
- /var: data that changes, especially /var/log for log files.
- /usr/bin and /bin: programs and commands.
- /tmp: temporary files, cleared on reboot.
- /opt: optional software, often where company apps are installed.

## Where am I? pwd, ls and cd

The terminal always has a current working directory. pwd prints it, ls lists what is in it, and cd changes it.

` + "```bash" + sh`
pwd                 # /home/asha
ls                  # names only
ls -l               # long format: permissions, owner, size, date
ls -la              # also show hidden files (names that start with a dot)
ls -lh /var/log     # human sizes (4.0K, 12M) for another directory
cd /etc             # absolute path: starts with /
cd nginx            # relative path: from where you are now
cd ..               # one level up
cd ~                # home (plain cd does the same)
cd -                # back to the previous directory
` + "```" + sh`

An absolute path starts at / and works from anywhere. A relative path starts from the current directory. The special names . (this directory) and .. (the parent) can appear anywhere in a path: ../logs/app.log means "go up one level, then into logs".

## Creating, copying, moving and deleting

` + "```bash" + sh`
mkdir reports                       # one directory
mkdir -p project/src/utils          # create missing parents too
touch notes.txt                     # create an empty file (or update its time)
cp notes.txt notes.bak              # copy a file
cp -r project project-backup        # copy a directory: needs -r
mv notes.bak old/                   # move into a directory
mv draft.txt final.txt              # rename (same directory)
rm final.txt                        # delete a file
rm -r project-backup                # delete a directory and everything inside
rmdir empty-folder                  # delete an empty directory only
` + "```" + sh`

There is no recycle bin in the terminal. rm is permanent. Common mistakes:

- rm -rf with a variable that is empty, such as rm -rf "$dir"/ when dir was never set, deletes from the root. Always quote variables and check them first.
- Spaces in names: my file.txt is two arguments. Quote it: "my file.txt".
- cp without -r on a directory fails with "omitting directory".
- mv overwrites the target silently. Use mv -i or cp -i to be asked first.

Brace expansion saves typing: mkdir -p app/{src,tests,docs} creates three folders, and cp config.yml{,.bak} copies config.yml to config.yml.bak.

## Finding files with find

find walks a directory tree and tests every file:

` + "```bash" + sh`
find . -name "*.log"                    # by name (quote the pattern)
find /var/log -type f -size +100M       # regular files over 100 MB
find . -type d -name node_modules       # directories only
find ~/downloads -mtime +30             # modified more than 30 days ago
find /tmp -name "*.tmp" -mtime +7 -delete
find . -name "*.sh" -exec chmod +x {} \;
` + "```" + sh`

- -type f is a file, -type d a directory.
- -name is case-sensitive; -iname ignores case.
- -mtime -7 means "changed in the last 7 days", +7 means "older than 7 days".
- Run the command without -delete first, look at the list, then add -delete.

## Paths inside scripts

Bash can cut paths apart without calling any program, using parameter expansion:

` + "```bash" + sh`
path="/home/asha/notes/todo.txt"
echo "$\{path##*/}"     # todo.txt   (remove everything up to the last /)
echo "$\{path%/*}"      # /home/asha/notes (remove from the last / on)
file="$\{path##*/}"
echo "$\{file##*.}"     # txt        (the extension)
` + "```" + sh`

The commands basename and dirname do the same job. ## removes the longest match from the front, # the shortest; %% and % do the same from the back.

## How these assignments are checked

Command sheets are .sh files with one command per line. They are read, not run, so rules look for the right commands and options (for example that you used mkdir -p and quoted a pattern). Comments starting with # are ignored, so the answer must be in real commands. Script questions are run with bash against hidden inputs: read the input with read, and print only what the question asks for.`,
  questions: [
    sq("Set up a project folder", "Write the commands to create a new project layout from your home directory and check it.", ["Go to your home directory", "Create project/src, project/tests and project/docs in one mkdir command (use -p and braces)", "Go into project and print the current directory", "List everything in it in long format, hidden files included"], sh`#!/bin/bash
cd ~
mkdir -p project/{src,tests,docs}
cd project
pwd
ls -la
`, [m(String.raw`^\s*cd(\s+~)?\s*$`, "Goes to the home directory with cd ~ (or plain cd)"), m(String.raw`^\s*mkdir\s+-p\s+\S*\{[^}]*src[^}]*\}`, "Creates the three folders with mkdir -p and brace expansion"), m(String.raw`^\s*cd\s+(\./)?project/?\s*$`, "Changes into project"), m(String.raw`^\s*pwd\s*$`, "Prints the working directory with pwd"), m(String.raw`^\s*ls\s+-(la|al|lA|Al)\b`, "Lists in long format including hidden files (ls -la)")]),

    sq("Copy, rename and delete", "You have report.txt and a directory named photos in the current directory. Write the commands to back them up and tidy up.", ["Copy report.txt to report.bak", "Copy the whole photos directory to photos-backup", "Rename report.bak to report-old.txt", "Move report-old.txt into a directory named archive (create archive first)", "Delete the photos-backup directory and everything in it"], sh`#!/bin/bash
cp report.txt report.bak
cp -r photos photos-backup
mv report.bak report-old.txt
mkdir -p archive
mv report-old.txt archive/
rm -r photos-backup
`, [m(String.raw`^\s*cp\s+report\.txt\s+report\.bak\s*$`, "Copies report.txt to report.bak"), m(String.raw`^\s*cp\s+-[a-zA-Z]*[rR][a-zA-Z]*\s+photos/?\s+photos-backup`, "Copies the directory with cp -r"), m(String.raw`^\s*mv\s+report\.bak\s+report-old\.txt\s*$`, "Renames with mv"), m(String.raw`^\s*mkdir\s+(-p\s+)?archive\s*$`, "Creates the archive directory"), m(String.raw`^\s*mv\s+report-old\.txt\s+archive/?\s*$`, "Moves the file into archive"), m(String.raw`^\s*rm\s+-[a-zA-Z]*r[a-zA-Z]*\s+photos-backup/?\s*$`, "Deletes the backup directory with rm -r")]),

    sq("Find files by name, type and size", "Write find commands for these searches, all starting from the current directory.", ["All files ending in .log (quote the pattern)", "All directories named node_modules", "Regular files bigger than 50 MB", "Files ending in .py modified in the last 2 days", "Files named README in any capitalisation (readme, Readme...)"], sh`#!/bin/bash
find . -name "*.log"
find . -type d -name node_modules
find . -type f -size +50M
find . -name "*.py" -mtime -2
find . -iname readme
`, [m(String.raw`^\s*find\s+\.\s+-name\s+("\*\.log"|'\*\.log')`, "Finds *.log with a quoted pattern"), m(String.raw`^\s*find\s+\.\s+(-type\s+d\s+-name\s+node_modules|-name\s+node_modules\s+-type\s+d)`, "Finds node_modules directories with -type d"), m(String.raw`^\s*find\s+\..*-type\s+f.*-size\s+\+50M`, "Finds files over 50 MB with -type f -size +50M"), m(String.raw`^\s*find\s+\..*-name\s+["']\*\.py["'].*-mtime\s+-2`, "Finds recent .py files with -mtime -2"), m(String.raw`^\s*find\s+\..*-iname\s+["']?readme`, "Ignores case with -iname")]),

    sq("Clean up old log files safely", "An app writes logs to /var/log/myapp. Write the commands a careful admin runs to delete .log files older than 30 days.", ["First list the matching files (no delete) so you can check them", "Then count them by piping find into wc -l", "Then delete them with find's -delete option", "Use -type f so directories are never matched"], sh`#!/bin/bash
find /var/log/myapp -type f -name "*.log" -mtime +30
find /var/log/myapp -type f -name "*.log" -mtime +30 | wc -l
find /var/log/myapp -type f -name "*.log" -mtime +30 -delete
`, [m(String.raw`^\s*find\s+/var/log/myapp\b(?!.*-delete).*-mtime\s+\+30(?!.*-delete)\s*$`, "Lists the old files first without deleting"), m(String.raw`^\s*find\s+/var/log/myapp\b.*\|\s*wc\s+-l`, "Counts the matches with wc -l"), m(String.raw`^\s*find\s+/var/log/myapp\b.*-type\s+f.*-mtime\s+\+30.*-delete`, "Deletes only files older than 30 days"), not(String.raw`\brm\s+-rf\s+/`, "Does not use rm -rf on a path")], { level: "intermediate" }),

    sq("Make every script executable", "A repository has many .sh files in different folders and none of them can be run. Write the commands to fix it and prove it worked.", ["Use find with -exec to run chmod +x on every *.sh file under the current directory", "Then list them again with find ... -perm -u+x (files the owner can execute)", "Finally show the long listing of scripts/deploy.sh"], sh`#!/bin/bash
find . -type f -name "*.sh" -exec chmod +x {} \;
find . -type f -name "*.sh" -perm -u+x
ls -l scripts/deploy.sh
`, [m(String.raw`^\s*find\s+\..*-name\s+["']\*\.sh["'].*-exec\s+chmod\s+(\+x|u\+x|755)\s+\{\}\s+(\\;|\+)`, "Runs chmod +x on every script with -exec ... {} \\;"), m(String.raw`-perm\s+-u\+x`, "Checks with -perm -u+x"), m(String.raw`^\s*ls\s+-l\s+scripts/deploy\.sh`, "Shows the long listing of deploy.sh"), not(String.raw`chmod\s+(-R\s+)?777`, "Does not use chmod 777")], { level: "intermediate" }),

    bq("Directory, name and extension", "Read one absolute path to a file and print its directory, its file name and its extension, each on its own line. If the name has no dot, print none as the extension.", ["Input: one absolute path, such as /home/asha/notes/todo.txt", "Output: three lines: the directory, the file name, the extension (or none)", "Use parameter expansion (##, %) instead of calling other programs", exactOut], sh`#!/bin/bash
read -r path
dir="$\{path%/*}"
name="$\{path##*/}"
if [[ "$name" == *.* ]]; then
    ext="$\{name##*.}"
else
    ext="none"
fi
echo "$\{dir:-/}"
echo "$name"
echo "$ext"
`, [["/home/asha/notes/todo.txt", "/home/asha/notes\ntodo.txt\ntxt"], ["/var/log/nginx/access.log", "/var/log/nginx\naccess.log\nlog"]], [["/opt/app/backup.tar.gz", "/opt/app\nbackup.tar.gz\ngz"], ["/usr/bin/python3", "/usr/bin\npython3\nnone"], ["/etc/hosts", "/etc\nhosts\nnone"]], { match: "exact" }),

    bq("Absolute or relative", "Read a path and say whether it is absolute (starts with /) or relative.", ["Input: one path", "Output: absolute or relative"], sh`#!/bin/bash
read -r p
if [[ "$p" == /* ]]; then
    echo "absolute"
else
    echo "relative"
fi
`, [["/etc/nginx/nginx.conf", "absolute"], ["docs/readme.md", "relative"]], [["../logs/app.log", "relative"], ["/", "absolute"], ["./run.sh", "relative"]]),

    bq("Count entries in an ls -l listing", "The input is the output of ls -l (without the total line). Count the directories (lines starting with d), regular files (starting with -) and symbolic links (starting with l).", ["Input: several lines of ls -l output", "Output: dirs: X, files: Y, links: Z"], sh`#!/bin/bash
dirs=0
files=0
links=0
while read -r perms rest || [ -n "$perms" ]; do
    case "$perms" in
        d*) dirs=$((dirs + 1)) ;;
        -*) files=$((files + 1)) ;;
        l*) links=$((links + 1)) ;;
    esac
done
echo "dirs: $dirs, files: $files, links: $links"
`, [["drwxr-xr-x 2 asha asha 4096 Jan 5 10:00 src\n-rw-r--r-- 1 asha asha 120 Jan 5 10:01 README.md\n-rwxr-xr-x 1 asha asha 800 Jan 5 10:02 run.sh\nlrwxrwxrwx 1 asha asha 11 Jan 5 10:03 latest -> release-2.1\n", "dirs: 1 files: 2 links: 1"]], [["-rw-r--r-- 1 om om 10 Feb 1 09:00 a.txt\n", "dirs: 0 files: 1 links: 0"], ["drwxr-xr-x 3 root root 4096 Mar 3 08:00 etc\ndrwxr-xr-x 3 root root 4096 Mar 3 08:00 var\ndrwxrwxrwt 9 root root 4096 Mar 3 08:00 tmp\nlrwxrwxrwx 1 root root 7 Mar 3 08:00 bin -> usr/bin", "dirs: 3 files: 0 links: 1"]], { level: "intermediate" }),

    bq("Human-readable size", "Read a size in bytes and print it the way ls -lh does: under 1024 print the bytes with B, otherwise divide by 1024 until it is under 1024 and print one decimal with the unit K, M or G.", ["Input: one whole number of bytes", "Output: for example 512B, 1.5K, 2.0M, 3.2G", exactOut], sh`#!/bin/bash
read -r bytes
awk -v b="$bytes" 'BEGIN {
    if (b < 1024) { printf "%dB\n", b; exit }
    split("K M G", units, " ")
    i=0
    while (b >= 1024 && i < 3) { b /= 1024; i++ }
    printf("%.1f%s\n", b, units[i])
}'
`, [["512", "512B"], ["1536", "1.5K"]], [["2097152", "2.0M"], ["3435973837", "3.2G"], ["1023", "1023B"], ["1024", "1.0K"]], { level: "intermediate", match: "exact" }),

    bq("Resolve a cd path", "Read the current directory and a cd target, and print the directory you end up in. The target may be absolute or relative and may contain . and .. (going up from / stays at /).", ["Input line 1: the current directory (absolute, no trailing slash)", "Input line 2: the target", "Output: the resulting absolute path", exactOut], sh`#!/bin/bash
read -r cur
read -r target
if [[ "$target" == /* ]]; then
    full="$target"
else
    full="$cur/$target"
fi
parts=()
IFS='/' read -ra segs <<< "$full"
for s in "$\{segs[@]}"; do
    case "$s" in
        ""|.) ;;
        ..) if [ "$\{#parts[@]}" -gt 0 ]; then unset 'parts[-1]'; fi ;;
        *) parts+=("$s") ;;
    esac
done
out=""
for p in "$\{parts[@]}"; do
    out="$out/$p"
done
echo "$\{out:-/}"
`, [["/home/asha\nprojects/web", "/home/asha/projects/web"], ["/home/asha/projects\n../notes", "/home/asha/notes"]], [["/var/log\n/etc/./nginx/../ssh", "/etc/ssh"], ["/home\n../../..", "/"], ["/srv/app\n./releases/./v2/..", "/srv/app/releases"]], { level: "advanced", match: "exact" }),
  ],
  quiz: [
    { q: "Where are system-wide configuration files kept on Linux?", options: ["/home", "/etc", "/bin", "/tmp"], answer: 1, why: "/etc holds configuration such as /etc/ssh/sshd_config and /etc/nginx." },
    { q: "Which command prints the directory you are in?", options: ["cd", "ls", "pwd", "whoami"], answer: 2, why: "pwd means print working directory." },
    { q: "Which of these is an absolute path?", options: ["logs/app.log", "../app.log", "./app.log", "/var/log/app.log"], answer: 3, why: "Only a path that starts with / is absolute; the others start from the current directory." },
    { q: "What does ls -a add to the listing?", options: ["File sizes", "Hidden files whose names start with a dot", "Files in subdirectories", "Alphabetical sorting"], answer: 1, why: "-a shows all entries, including dotfiles like .bashrc and .git." },
    { q: "cp photos photos-backup fails when photos is a directory. What is missing?", options: ["-f", "-r", "-v", "sudo"], answer: 1, why: "cp copies directories only with -r (recursive)." },
    { q: "What does mkdir -p a/b/c do when a does not exist?", options: ["Fails with an error", "Creates a, a/b and a/b/c", "Creates only c", "Asks for confirmation"], answer: 1, why: "-p creates any missing parent directories and does not complain if they exist." },
    { q: "Which find option matches files changed within the last 7 days?", options: ["-mtime +7", "-mtime 7", "-mtime -7", "-newer 7"], answer: 2, why: "-7 means less than 7 days ago; +7 means more than 7 days ago." },
    { q: "With path=/srv/app/v2/app.tar.gz, what does echo \"${path##*.}\" print?", options: ["tar.gz", "gz", "/srv/app/v2/app.tar", "app.tar.gz"], answer: 1, why: "## removes the longest match of *. from the front, leaving everything after the last dot." },
    { q: "You are in /home/asha/projects. Where does cd ../../ravi/./docs take you?", options: ["/home/ravi/docs", "/home/asha/ravi/docs", "/ravi/docs", "/home/asha/projects/ravi/docs"], answer: 0, why: "Two .. steps go up to /home, then ravi, . stays put, then docs." },
    { q: "A script runs rm -rf \"$build\"/ and build was never set. What happens?", options: ["Nothing, rm refuses empty names", "It deletes the current directory only", "It becomes rm -rf / and tries to delete the whole system", "Bash stops with an unset variable error by default"], answer: 2, why: "An unset variable expands to nothing, leaving /; check variables (or use ${build:?}) before rm -rf." },
  ],
};
