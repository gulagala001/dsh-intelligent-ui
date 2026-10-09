import { skillContent } from './skill.mjs';

export const name = 'intelligent-ui-prompt';
export const inject = ['systemPrompt'];
export function apply(ctx) {
  // This plugin is mounted only inside the dedicated native agent preset.
  ctx.effect(() => ctx.systemPrompt.section({
    name: 'intelligent-ui:answers',
    order: 9500,
    interpolate: false,
    text: `Create clear, useful answers in the user's language. Choose an interactive answer when controls, comparison, exploration or a small tool materially help; use ordinary prose when it is clearer. Keep layouts compact and avoid decorative dashboards. Use the host's existing model and tool loop. A generated interface never invokes tools or sends another model request by itself.\n\n${skillContent()}`,
  }), 'intelligent-ui.preset-prompt');
}
