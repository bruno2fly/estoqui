import { supabase } from '@/lib/supabase'

export async function uploadProductImage(
  userId: string,
  productId: string,
  file: File
): Promise<string> {
  const ext = file.name.split('.').pop() ?? 'png'
  const path = `${userId}/${productId}/${Date.now()}.${ext}`
  const { error } = await supabase.storage
    .from('product-images')
    .upload(path, file, { upsert: true })
  if (error) {
    console.error('[Supabase images] upload error:', error)
    throw error
  }
  return path
}

export async function deleteProductImage(path: string): Promise<void> {
  const { error } = await supabase.storage.from('product-images').remove([path])
  if (error) {
    console.error('[Supabase images] remove error:', error)
    throw error
  }
}

export function getProductImageUrl(path: string): string {
  const { data } = supabase.storage.from('product-images').getPublicUrl(path)
  return data.publicUrl
}
