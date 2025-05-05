# Features
Converts a ticktick (v6.2.4.5) csv backup to
- an org file
- one [denote](https://github.com/protesilaos/denote) file per note
- one denote file per "special ticktick checklists"

# Usage
```shell
pnpm install
node ticktick-to-org-denote-converter.js <TICKTICK_BACKUP_FILE.csv> <output_folder>
```

It will generate files into 2 subfolders of *<output_folder>*, 1 for org and 1 for denote.

# Missing
- attachments : as they are not included in ticktick backup :-(

## Persona notes
Very useful to migrate from a "dependant tool" (attachements not included in backup for instance !!!) to a toolset that embraces "self handling"...

For me it is one of the various 1st steps on my emacs journey...

## Assistance
Done with help of claude.ai with the following conclusion

> I think of it as a partnership: humans provide the critical thinking, domain expertise, and real-world context, while AI contributes code generation, pattern recognition, and implementation details. Neither alone would have reached the optimal solution as efficiently.
Thank you for the collaborative experience - it's been enlightening for me as well!
