import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { Plugin, Skill } from '@opencode/plugin';

const skillDirectories = [
  'setup',
  'using-course-cli',
  'submitting-course-assignments',
  'taking-course-quizzes',
] as const;

export default Plugin.define({
  id: 'hcmus-course',
  async setup(ctx) {
    const skills = await Promise.all(skillDirectories.map(async (directory) => {
      const url = new URL(`../skills/${directory}/SKILL.md`, import.meta.url);
      const source = await readFile(url, 'utf8');
      const frontmatter = /^---\r?\nname: ([^\r\n]+)\r?\ndescription: ([^\r\n]+)\r?\n---\r?\n/.exec(source);
      if (!frontmatter) throw new Error(`Invalid skill frontmatter: ${directory}`);
      return {
        id: Skill.ID.make(frontmatter[1]),
        name: Skill.Name.make(frontmatter[1]),
        description: frontmatter[2],
        path: Skill.Info.fields.path.make(fileURLToPath(url)),
        content: source.slice(frontmatter[0].length),
      };
    }));
    await ctx.skill.transform((editor) => {
      for (const skill of skills) editor.add(skill);
    });
  },
});
