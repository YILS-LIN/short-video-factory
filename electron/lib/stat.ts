import axios from 'axios'
import { app, screen } from 'electron'
import { isDev } from './is-dev'
import type { StatEventParams } from '../types'

const STAT_API_URL = 'https://stat.yils.blog/api/send'
const WEBSITE_ID = 'a15a52e1-e2ad-4cc7-a6f1-c0979e8dd9c7'
const APP_HOSTNAME = 'short-video-factory.app'
const APP_URL = 'https://short-video-factory.app/'
const DEV_MODE_REFERRER = 'https://dev.mode/'
const PROD_MODE_REFERRER = 'https://prod.mode/'

function isAnalyticsInDevEnabled(): boolean {
  const value = process.env['ANALYTICS_IN_DEV']
  if (!value) {
    return false
  }

  const normalized = value.trim().toLowerCase()
  return ['1', 'true', 'yes', 'on'].includes(normalized)
}

function shouldSendStat(): boolean {
  if (!isDev) {
    return true
  }
  return isAnalyticsInDevEnabled()
}

function getDefaultScreenSize(): string {
  const { width, height } = screen.getPrimaryDisplay().size
  return `${width}x${height}`
}

function getReferrerByMode(): string {
  return isDev ? DEV_MODE_REFERRER : PROD_MODE_REFERRER
}

export async function sendStatEvent(params: StatEventParams): Promise<void> {
  if (!shouldSendStat()) {
    return
  }

  const headers: Record<string, string> = {
    accept: '*/*',
    'content-type': 'application/json',
  }

  if (params.userAgent?.trim()) {
    headers['user-agent'] = params.userAgent
  }

  const payload = {
    website: WEBSITE_ID,
    screen: params.screen || getDefaultScreenSize(),
    language: params.language || app.getLocale() || 'zh-CN',
    title: params.title,
    hostname: APP_HOSTNAME,
    url: params.url || APP_URL,
    referrer: getReferrerByMode(),
  }

  try {
    await axios.post(
      STAT_API_URL,
      {
        type: 'event',
        payload,
      },
      {
        headers,
        timeout: 5000,
      },
    )
  } catch (error) {
    if (isDev) {
      console.warn('[stat] send event failed:', error)
    }
  }
}
