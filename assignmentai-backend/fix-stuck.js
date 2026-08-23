const supabase = require('./src/config/supabaseAdmin');

async function fixStuckSubmissions() {
  const { data, error } = await supabase
    .from('submissions')
    .select('id, status, file_url, ai_reports(id)')
    .eq('status', 'submitted');

  if (error) {
    console.error(error);
    return;
  }

  console.log(`Found ${data.length} submissions in 'submitted' status.`);

  for (const sub of data) {
    if (!sub.file_url) {
      console.log(`Marking ${sub.id} as not_found/failed due to missing file.`);
      await supabase.from('submissions').update({ status: 'failed' }).eq('id', sub.id);
    } else {
      console.log(`Marking ${sub.id} as failed (assumed stuck)`);
      await supabase.from('submissions').update({ status: 'failed' }).eq('id', sub.id);
    }
  }
}

fixStuckSubmissions().then(() => console.log('Done'));
