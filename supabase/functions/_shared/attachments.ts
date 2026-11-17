import { adminClient } from './supabase.ts';
import { sendMedia } from './telegram.ts';

export async function sendPostAttachments(chatId: string, postId: string) {
  const admin = adminClient();
  const { data: files, error } = await admin.from('post_attachments')
    .select('storage_path,file_name,mime_type').eq('post_id', postId).order('created_at');
  if (error) throw error;
  for (const file of files || []) {
    const { data: signed, error: signedError } = await admin.storage.from('post-attachments').createSignedUrl(file.storage_path, 3600);
    if (signedError || !signed?.signedUrl) throw signedError || new Error('Не удалось открыть вложение');
    await sendMedia(chatId, file, signed.signedUrl);
  }
}
