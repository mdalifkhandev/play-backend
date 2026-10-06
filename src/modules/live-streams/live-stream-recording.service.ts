import agoraToken from 'agora-token';

import { env } from '../../config/env.config.js';
import { externalTimeoutMs } from '../../infrastructure/http/external-timeout.js';
import { logger } from '../../infrastructure/logger/logger.js';
import type { ILiveStream, ILiveRecordingState } from './live-stream.model.js';

const { RtcTokenBuilder, RtcRole } = agoraToken;

interface StartRecordingInput {
  streamId: string;
  channelName: string;
}

interface StopRecordingInput {
  streamId: string;
  channelName: string;
  recording: ILiveRecordingState;
}

interface AgoraAcquireResponse {
  resourceId: string;
}

interface AgoraStartResponse {
  resourceId: string;
  sid: string;
}

interface AgoraStopResponse {
  resourceId?: string;
  sid?: string;
  serverResponse?: {
    fileList?: unknown;
    fileListMode?: string;
  };
}

export class LiveStreamRecordingService {
  isEnabled(): boolean {
    return env.AGORA_CLOUD_RECORDING_ENABLED;
  }

  async start(input: StartRecordingInput): Promise<ILiveRecordingState | null> {
    if (!this.isEnabled()) {
      return null;
    }

    const appId = env.AGORA_APP_ID;
    const appCertificate = env.AGORA_APP_CERTIFICATE;
    const customerId = env.AGORA_CUSTOMER_ID;
    const customerSecret = env.AGORA_CUSTOMER_SECRET;
    if (!appId || !appCertificate || !customerId || !customerSecret) {
      logger.warn({ streamId: input.streamId }, 'Agora cloud recording is enabled but credentials are incomplete');
      return {
        status: 'failed',
        errorMessage: 'Agora cloud recording credentials are incomplete.',
      };
    }

    const uid = String(stringToNumericUid(`${env.AGORA_RECORDING_UID_SEED}:${input.streamId}`));
    const token = this.buildRecorderToken(appId, appCertificate, input.channelName, Number(uid));
    const resourceId = await this.acquireResource(appId, customerId, customerSecret, input.channelName, uid);
    const started = await this.startRecording(appId, customerId, customerSecret, {
      channelName: input.channelName,
      uid,
      token,
      resourceId,
      streamId: input.streamId,
    });

    return {
      status: 'recording',
      uid,
      resourceId: started.resourceId,
      sid: started.sid,
      mode: env.AGORA_RECORDING_MODE,
      startedAt: new Date(),
    };
  }

  async stop(input: StopRecordingInput): Promise<ILiveRecordingState | null> {
    if (!this.isEnabled()) {
      return null;
    }

    const appId = env.AGORA_APP_ID;
    const customerId = env.AGORA_CUSTOMER_ID;
    const customerSecret = env.AGORA_CUSTOMER_SECRET;
    const { resourceId, sid, uid } = input.recording;
    if (!appId || !customerId || !customerSecret || !resourceId || !sid || !uid) {
      logger.warn(
        { streamId: input.streamId, recording: redactRecording(input.recording) },
        'Cannot stop Agora cloud recording because session data is incomplete',
      );
      return {
        ...input.recording,
        status: 'failed',
        stoppedAt: new Date(),
        errorMessage: 'Agora cloud recording session data is incomplete.',
      };
    }

    const stopped = await this.stopRecording(appId, customerId, customerSecret, {
      channelName: input.channelName,
      uid,
      resourceId,
      sid,
    });

    const { errorMessage: _errorMessage, ...recordingWithoutError } = input.recording;

    return {
      ...recordingWithoutError,
      status: 'stopped',
      fileList: stopped.serverResponse?.fileList,
      stoppedAt: new Date(),
    };
  }

  private buildRecorderToken(appId: string, appCertificate: string, channelName: string, uid: number): string {
    const expiresInSeconds = 24 * 60 * 60;
    const privilegeExpiredTs = Math.floor(Date.now() / 1000) + expiresInSeconds;

    return RtcTokenBuilder.buildTokenWithUid(
      appId,
      appCertificate,
      channelName,
      uid,
      RtcRole.SUBSCRIBER,
      privilegeExpiredTs,
      privilegeExpiredTs,
    );
  }

  private async acquireResource(
    appId: string,
    customerId: string,
    customerSecret: string,
    channelName: string,
    uid: string,
  ): Promise<string> {
    const response = await this.request<AgoraAcquireResponse>(
      appId,
      customerId,
      customerSecret,
      '/cloud_recording/acquire',
      {
        cname: channelName,
        uid,
        clientRequest: {
          resourceExpiredHour: 24,
        },
      },
    );

    if (!response.resourceId) {
      throw new Error('Agora cloud recording acquire response did not include resourceId.');
    }

    return response.resourceId;
  }

  private async startRecording(
    appId: string,
    customerId: string,
    customerSecret: string,
    input: {
      channelName: string;
      uid: string;
      token: string;
      resourceId: string;
      streamId: string;
    },
  ): Promise<AgoraStartResponse> {
    const response = await this.request<AgoraStartResponse>(
      appId,
      customerId,
      customerSecret,
      `/cloud_recording/resourceid/${encodeURIComponent(input.resourceId)}/mode/${env.AGORA_RECORDING_MODE}/start`,
      {
        cname: input.channelName,
        uid: input.uid,
        clientRequest: {
          token: input.token,
          recordingConfig: {
            channelType: 1,
            streamTypes: 2,
            audioProfile: 1,
            maxIdleTime: env.AGORA_RECORDING_MAX_IDLE_TIME_SECONDS,
            ...(env.AGORA_RECORDING_MODE === 'mix'
              ? {
                  transcodingConfig: {
                    width: 720,
                    height: 1280,
                    fps: 30,
                    bitrate: 2000,
                    mixedVideoLayout: 1,
                    backgroundColor: '#000000',
                  },
                }
              : {}),
          },
          recordingFileConfig: {
            avFileType: ['hls', 'mp4'],
          },
          storageConfig: {
            vendor: env.AGORA_RECORDING_STORAGE_VENDOR,
            region: env.AGORA_RECORDING_STORAGE_REGION,
            bucket: env.AGORA_RECORDING_STORAGE_BUCKET,
            accessKey: env.AGORA_RECORDING_STORAGE_ACCESS_KEY,
            secretKey: env.AGORA_RECORDING_STORAGE_SECRET_KEY,
            fileNamePrefix: [env.AGORA_RECORDING_FILE_PREFIX, input.streamId],
          },
        },
      },
    );

    if (!response.sid) {
      throw new Error('Agora cloud recording start response did not include sid.');
    }

    return response;
  }

  private async stopRecording(
    appId: string,
    customerId: string,
    customerSecret: string,
    input: {
      channelName: string;
      uid: string;
      resourceId: string;
      sid: string;
    },
  ): Promise<AgoraStopResponse> {
    return this.request<AgoraStopResponse>(
      appId,
      customerId,
      customerSecret,
      `/cloud_recording/resourceid/${encodeURIComponent(input.resourceId)}/sid/${encodeURIComponent(input.sid)}/mode/${env.AGORA_RECORDING_MODE}/stop`,
      {
        cname: input.channelName,
        uid: input.uid,
        clientRequest: {},
      },
    );
  }

  private async request<T>(
    appId: string,
    customerId: string,
    customerSecret: string,
    path: string,
    body: Record<string, unknown>,
  ): Promise<T> {
    const url = `https://api.agora.io/v1/apps/${encodeURIComponent(appId)}${path}`;
    let response: Response;

    try {
      response = await fetch(url, {
        method: 'POST',
        headers: {
          Authorization: `Basic ${Buffer.from(`${customerId}:${customerSecret}`).toString('base64')}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(externalTimeoutMs.agoraRecording),
      });
    } catch (error) {
      if (error instanceof Error && (error.name === 'AbortError' || error.name === 'TimeoutError')) {
        throw new Error('Agora cloud recording request timed out.');
      }
      throw error;
    }

    const text = await response.text();
    const data = text ? JSON.parse(text) : {};
    if (!response.ok) {
      throw new Error(`Agora cloud recording request failed with status ${response.status}: ${text}`);
    }

    return data as T;
  }
}

export const liveStreamRecordingService = new LiveStreamRecordingService();

export function isRecordingActive(recording?: ILiveStream['recording']): boolean {
  return recording?.status === 'recording' && Boolean(recording.resourceId && recording.sid && recording.uid);
}

function stringToNumericUid(str: string): number {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = (hash << 5) - hash + str.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash) || 1;
}

function redactRecording(recording: ILiveRecordingState): Partial<ILiveRecordingState> {
  const redacted: Partial<ILiveRecordingState> = {
    status: recording.status,
  };
  if (recording.uid) redacted.uid = recording.uid;
  if (recording.resourceId) redacted.resourceId = recording.resourceId;
  if (recording.sid) redacted.sid = recording.sid;
  if (recording.mode) redacted.mode = recording.mode;
  return redacted;
}
