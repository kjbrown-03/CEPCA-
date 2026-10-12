import { Global, Injectable, Logger, Module, OnModuleInit } from '@nestjs/common'
import { CreateBucketCommand, DeleteObjectCommand, GetObjectCommand, HeadBucketCommand, HeadObjectCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3'
import { createReadStream } from 'node:fs'
import type { Readable } from 'node:stream'
import { env } from '../config/env'

/**
 * Stockage objet S3. Le stockage n'est jamais exposé : chaque fichier repasse par l'API après contrôle
 * des droits (pas d'URL signée, qui resterait valable après un retrait de droits).
 */
@Injectable()
export class StorageService implements OnModuleInit {
  private readonly log = new Logger('Stockage')
  readonly s3 = new S3Client({
    endpoint: env.S3_ENDPOINT,
    region: env.S3_REGION,
    forcePathStyle: true,
    credentials: { accessKeyId: env.S3_ACCESS_KEY, secretAccessKey: env.S3_SECRET_KEY },
  })

  async onModuleInit() {
    if (env.NODE_ENV === 'test') return
    try {
      await this.s3.send(new HeadBucketCommand({ Bucket: env.S3_BUCKET }))
    } catch {
      try {
        await this.s3.send(new CreateBucketCommand({ Bucket: env.S3_BUCKET }))
        this.log.log(`Compartiment ${env.S3_BUCKET} créé`)
      } catch (e) {
        this.log.warn(`Stockage objet indisponible : ${(e as Error).message}`)
      }
    }
  }

  async put(key: string, body: Buffer, contentType: string) {
    await this.s3.send(new PutObjectCommand({ Bucket: env.S3_BUCKET, Key: key, Body: body, ContentType: contentType }))
  }

  /** Dépôt d'un gros fichier (audio, vidéo) depuis le disque, sans le charger en mémoire. */
  async putFile(key: string, path: string, size: number, contentType: string) {
    await this.s3.send(new PutObjectCommand({ Bucket: env.S3_BUCKET, Key: key, Body: createReadStream(path), ContentLength: size, ContentType: contentType }))
  }

  async remove(key: string) {
    await this.s3.send(new DeleteObjectCommand({ Bucket: env.S3_BUCKET, Key: key }))
  }

  async head(key: string) {
    const r = await this.s3.send(new HeadObjectCommand({ Bucket: env.S3_BUCKET, Key: key }))
    return { size: Number(r.ContentLength ?? 0), contentType: r.ContentType ?? 'application/octet-stream' }
  }

  async stream(key: string, range?: string) {
    const r = await this.s3.send(new GetObjectCommand({ Bucket: env.S3_BUCKET, Key: key, Range: range }))
    return {
      body: r.Body as Readable,
      contentType: r.ContentType ?? 'application/octet-stream',
      contentLength: Number(r.ContentLength ?? 0),
      contentRange: r.ContentRange,
    }
  }
}

@Global()
@Module({ providers: [StorageService], exports: [StorageService] })
export class StorageModule {}

/** URL publique d'un média : une clé « http… » (photos d'illustration du jeu de démo) est rendue telle quelle. */
export function mediaUrl(kind: 'img' | 'sermon' | 'doc', keyOrId: string | null | undefined): string | null {
  if (!keyOrId) return null
  if (/^https?:\/\//.test(keyOrId)) return keyOrId
  return `${env.PUBLIC_URL}/api/files/${kind}/${encodeURIComponent(keyOrId)}`
}

/** Nom de fichier ASCII pour Content-Disposition (accents retirés, guillemets neutralisés). */
export function asciiName(name: string): string {
  return name.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^\w.\- ]+/g, '_').slice(0, 120) || 'fichier'
}
