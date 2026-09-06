import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import { createClient } from '@supabase/supabase-js';
import { readFile } from 'node:fs/promises';
import path from 'node:path';

const dryRun = process.argv.includes('--dry-run');
const required = ['SUPABASE_URL', 'SUPABASE_SECRET_KEY', 'MIGRATION_USER_ID', 'SUPABASE_STORAGE_BUCKET'];
for (const key of required) if (!process.env[key]) throw new Error(`Falta ${key} en .env`);
const prisma = new PrismaClient();
const supabase = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SECRET_KEY!, { auth: { persistSession: false, autoRefreshToken: false } });
const userId = process.env.MIGRATION_USER_ID!;
const bucket = process.env.SUPABASE_STORAGE_BUCKET!;
const photosRoot = path.resolve('storage/photos');
const fail = (context: string, error: unknown) => { throw new Error(`${context}: ${error instanceof Error ? error.message : JSON.stringify(error)}`); };
const must = async <T>(promise: PromiseLike<{ data: T; error: any }>, context: string): Promise<T> => { const { data, error } = await promise; if (error) fail(context, error); return data; };

async function ensureDestination() {
  const profile = await must(supabase.from('profiles').select('id').eq('id', userId).maybeSingle(), 'No se puede consultar profiles'); if (!profile) throw new Error('No existe el perfil destino. Ejecuta schema.sql después de haber iniciado sesión con Google.');
  const { error } = await supabase.storage.getBucket(bucket); if (error) fail(`No existe o no es accesible el bucket ${bucket}`, error);
}
async function uploadPhoto(filePath: string, date: string) {
  const source = path.join(photosRoot, filePath); const target = `${userId}/${date}/${path.basename(filePath)}`;
  try { const data = await readFile(source); await must(supabase.storage.from(bucket).upload(target, data, { upsert: true, contentType: filePath.endsWith('.png') ? 'image/png' : filePath.endsWith('.webp') ? 'image/webp' : 'image/jpeg' }), `Foto ${filePath}`); return target; }
  catch (error) { console.warn(`Foto omitida (${filePath}): ${error instanceof Error ? error.message : String(error)}`); return null; }
}
async function main() {
  const [checkins, exercises, health] = await Promise.all([
    prisma.weeklyCheckin.findMany({ include: { bodyMetrics: true, photos: true, healthSummary: true, aiReports: true }, orderBy: { date: 'asc' } }),
    prisma.exercise.findMany({ include: { logs: true }, orderBy: { name: 'asc' } }),
    prisma.healthMetric.findMany({ orderBy: { recordedAt: 'asc' } })
  ]);
  await ensureDestination();
  console.log(`Preflight OK — ${checkins.length} check-ins, ${exercises.length} ejercicios, ${health.length} métricas de salud.`);
  if (dryRun) return;
  const checkinMap = new Map<string, string>();
  for (const item of checkins) {
    const checkin = await must(supabase.from('weekly_checkins').upsert({ user_id: userId, date: item.date.toISOString().slice(0, 10), week_number: item.weekNumber, notes: item.notes, energy: item.energy, motivation: item.motivation, stress: item.stress, hunger: item.hunger, recovery: item.recovery, training_feeling: item.trainingFeeling, soreness: item.soreness }, { onConflict: 'user_id,date' }).select('id').single(), `Check-in ${item.date.toISOString()}`);
    checkinMap.set(item.id, checkin.id);
    if (item.bodyMetrics) await must(supabase.from('body_metrics').upsert({ checkin_id: checkin.id, weight_kg: item.bodyMetrics.weight, bmi: item.bodyMetrics.bmi, body_fat_percentage: item.bodyMetrics.bodyFatPercentage, fat_mass_kg: item.bodyMetrics.fatMass, muscle_mass_kg: item.bodyMetrics.muscleMass, body_water_percentage: item.bodyMetrics.bodyWaterPercentage, visceral_fat: item.bodyMetrics.visceralFat, lean_mass_kg: item.bodyMetrics.leanMass, skeletal_muscle_percentage: item.bodyMetrics.skeletalMusclePercent, bone_mass_kg: item.bodyMetrics.boneMass, protein_percentage: item.bodyMetrics.proteinPercentage, bmr: item.bodyMetrics.bmr, body_age: item.bodyMetrics.bodyAge, waist_cm: item.bodyMetrics.waistCm, chest_cm: item.bodyMetrics.chestCm, left_arm_cm: item.bodyMetrics.leftArmCm, right_arm_cm: item.bodyMetrics.rightArmCm, left_thigh_cm: item.bodyMetrics.leftThighCm, right_thigh_cm: item.bodyMetrics.rightThighCm, source: item.bodyMetrics.source, measured_at: item.bodyMetrics.measuredAt?.toISOString() }, { onConflict: 'checkin_id' }), `Métricas ${item.date.toISOString()}`);
    for (const photo of item.photos) { const target = await uploadPhoto(photo.filePath, item.date.toISOString().slice(0, 10)); if (!target) continue; const existing = await must(supabase.from('photos').select('id').eq('checkin_id', checkin.id).eq('file_path', target).maybeSingle(), 'Comprobar foto'); if (!existing) await must(supabase.from('photos').insert({ checkin_id: checkin.id, type: photo.type, file_path: target }), 'Guardar foto'); }
    for (const summary of item.healthSummary) await must(supabase.from('weekly_health_summaries').upsert({ checkin_id: checkin.id, metric: summary.metric, weekly_value: summary.weeklyValue, unit: summary.unit, days_with_data: summary.daysWithData, aggregation_method: summary.aggregationMethod }, { onConflict: 'checkin_id,metric' }), 'Resumen de salud');
    for (const report of item.aiReports) await must(supabase.from('ai_reports').upsert({ checkin_id: checkin.id, report: report.report, model: report.model, version: report.version }, { onConflict: 'checkin_id,model,version' }), 'Informe IA');
  }
  for (const exercise of exercises) { const target = await must(supabase.from('exercises').upsert({ user_id: userId, name: exercise.name, unit: exercise.unit }, { onConflict: 'user_id,name' }).select('id').single(), `Ejercicio ${exercise.name}`); for (const log of exercise.logs) await must(supabase.from('weekly_exercise_logs').upsert({ exercise_id: target.id, week_start: log.weekStart.toISOString().slice(0, 10), total_sets: log.totalSets, repetitions: log.repetitions, weight: log.weight, volume: log.volume, note: log.note }, { onConflict: 'exercise_id,week_start' }), `Log ${exercise.name}`); }
  for (const metric of health) await must(supabase.from('health_metrics').upsert({ user_id: userId, metric_type: metric.metricType, value: metric.value, unit: metric.unit, recorded_at: metric.recordedAt.toISOString(), start_at: metric.startAt?.toISOString(), end_at: metric.endAt?.toISOString(), source: metric.source, external_id: metric.externalId }, { onConflict: 'user_id,source,external_id' }), `Salud ${metric.externalId}`);
  console.log('Migración completada. SQLite y las fotos locales no se han eliminado.');
}
main().catch(error => { console.error(error.message); process.exitCode = 1; }).finally(() => prisma.$disconnect());
