// Import tocfl_exams_full.json → Supabase (idempotent — safe to re-run).
// Run: node scripts/import-tocfl-exams.mjs [--dryrun]

import { getServiceClient } from './_supabase.mjs';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT   = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const args   = Object.fromEntries(process.argv.slice(2).map(a => { const [k,v]=a.replace(/^--/,'').split('='); return [k,v??true]; }));
const DRYRUN = !!args.dryrun;
const sb     = getServiceClient();

async function upsert(table, rows) {
  if (!rows.length) return;
  if (DRYRUN) { console.log(`  [dryrun] would upsert ${rows.length} rows into ${table}`); return; }
  // Supabase upsert in chunks to avoid request size limits
  const CHUNK = 500;
  for (let i = 0; i < rows.length; i += CHUNK) {
    const { error } = await sb.from(table).upsert(rows.slice(i, i + CHUNK), { onConflict: 'id' });
    if (error) throw new Error(`${table} chunk ${i}-${i+CHUNK}: ${error.message}`);
  }
}

async function main() {
  const jsonPath = path.join(ROOT, 'tocfl_exams_full.json');
  if (!fs.existsSync(jsonPath)) {
    console.error('tocfl_exams_full.json not found — run upload-tocfl-media-to-r2.mjs first.');
    process.exit(1);
  }

  const data = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));

  const exams = [], parts = [], groups = [], questions = [], options = [];

  for (const band of data.bands) {
    for (const exam of band.exams) {
      exams.push({
        id: exam.id, title: exam.title, band: exam.band,
        publish_year: exam.publish_year ?? null,
        total_questions: exam.total_questions ?? 100,
      });

      for (const part of exam.parts) {
        parts.push({
          id: part.id, exam_id: exam.id, part_number: part.part_number,
          skill: part.skill, instruction: part.instruction ?? null,
          question_count: part.question_count ?? 0,
        });

        for (const group of part.groups) {
          groups.push({
            id: group.id, part_id: part.id, order_num: group.order_num,
            level: group.level ?? null,
            shared_text: group.shared_text ?? null,
            shared_audio_url: group.shared_audio_url ?? null,
            shared_image_url: group.shared_image_url ?? null,
          });

          for (const q of group.questions) {
            questions.push({
              id: q.id, group_id: group.id, question_num: q.question_num,
              question_text: q.question_text ?? null,
              question_audio_url: q.question_audio_url ?? null,
              question_image_url: q.question_image_url ?? null,
              explanation: q.explanation ?? null,
            });

            for (const o of q.options) {
              options.push({
                id: o.id, question_id: q.id, label: o.label,
                text: o.text ?? null,
                image_url: o.image_url ?? null,
                is_correct: o.is_correct,
              });
            }
          }
        }
      }
    }
  }

  console.log(`Rows to insert: ${exams.length} exams, ${parts.length} parts, ${groups.length} groups, ${questions.length} questions, ${options.length} options`);
  if (DRYRUN) console.log('(dry run — nothing written to Supabase)\n');

  await upsert('tocfl_exams',     exams);     console.log('✓ tocfl_exams');
  await upsert('tocfl_parts',     parts);     console.log('✓ tocfl_parts');
  await upsert('tocfl_groups',    groups);    console.log('✓ tocfl_groups');
  await upsert('tocfl_questions', questions); console.log('✓ tocfl_questions');
  await upsert('tocfl_options',   options);   console.log('✓ tocfl_options');

  if (!DRYRUN) console.log('\n✓ Import complete.');
}

main().catch(e => { console.error(e); process.exit(1); });
