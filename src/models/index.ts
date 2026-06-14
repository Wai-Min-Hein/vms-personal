import { model, models, Schema, type InferSchemaType, type Model } from "mongoose";
import {
  AUDIT_ACTIONS,
  CAMERA_STATUSES,
  NOTIFICATION_SEVERITIES,
  NOTIFICATION_TYPES,
  RECORDING_STATUSES,
  STREAM_TYPES
} from "./constants";

const schemaOptions = {
  timestamps: true,
  toJSON: {
    virtuals: true,
    versionKey: false,
    transform: (_document: unknown, result: Record<string, unknown>) => {
      delete result._id;
      return result;
    }
  }
} as const;

const roleSchema = new Schema({
  name: { type: String, required: true, unique: true, trim: true },
  description: { type: String, default: null },
  permissions: { type: [String], required: true, default: [] }
}, schemaOptions);

const userSchema = new Schema({
  email: { type: String, required: true, unique: true, lowercase: true, trim: true },
  name: { type: String, required: true, trim: true },
  passwordHash: { type: String, required: true, select: false },
  active: { type: Boolean, default: true },
  roleId: { type: Schema.Types.ObjectId, ref: "Role", required: true, index: true }
}, schemaOptions);

const cameraGroupSchema = new Schema({
  name: { type: String, required: true, unique: true, trim: true },
  description: { type: String, default: null }
}, schemaOptions);

const cameraSchema = new Schema({
  pathName: { type: String, required: true, unique: true, trim: true },
  name: { type: String, required: true, trim: true },
  description: { type: String, default: null },
  location: { type: String, default: null },
  groupId: { type: Schema.Types.ObjectId, ref: "CameraGroup", default: null, index: true },
  sourceUrl: { type: String, required: true },
  streamType: { type: String, enum: STREAM_TYPES, required: true },
  enabled: { type: Boolean, default: true, index: true },
  recordingEnabled: { type: Boolean, default: false },
  retentionDays: { type: Number, default: 30, min: 1 },
  recordSegmentDuration: { type: Number, default: 3600, min: 10 },
  status: { type: String, enum: CAMERA_STATUSES, default: "UNKNOWN", index: true },
  lastSeenAt: { type: Date, default: null }
}, schemaOptions);

const recordingSchema = new Schema({
  cameraId: { type: Schema.Types.ObjectId, ref: "Camera", required: true, index: true },
  path: { type: String, required: true, unique: true },
  fileName: { type: String, required: true },
  format: { type: String, default: "fmp4" },
  sizeBytes: { type: Number, default: 0 },
  durationMs: { type: Number, default: null },
  startedAt: { type: Date, required: true, index: true },
  endedAt: { type: Date, default: null },
  status: { type: String, enum: RECORDING_STATUSES, default: "RECORDING", index: true }
}, schemaOptions);
recordingSchema.index({ cameraId: 1, startedAt: -1 });

const cameraMetricSchema = new Schema({
  cameraId: { type: Schema.Types.ObjectId, ref: "Camera", required: true, index: true },
  ready: { type: Boolean, required: true },
  inboundBytes: { type: Number, default: 0 },
  outboundBytes: { type: Number, default: 0 },
  readers: { type: Number, default: 0 },
  bitrate: { type: Number, default: 0 },
  uptimeSeconds: { type: Number, default: 0 },
  capturedAt: { type: Date, default: Date.now }
}, { toJSON: schemaOptions.toJSON });
cameraMetricSchema.index({ cameraId: 1, capturedAt: -1 });
cameraMetricSchema.index({ capturedAt: 1 }, { expireAfterSeconds: 30 * 24 * 60 * 60 });

const notificationSchema = new Schema({
  type: { type: String, enum: NOTIFICATION_TYPES, required: true },
  severity: { type: String, enum: NOTIFICATION_SEVERITIES, default: "INFO" },
  title: { type: String, required: true },
  message: { type: String, required: true },
  cameraId: { type: Schema.Types.ObjectId, ref: "Camera", default: null, index: true },
  acknowledged: { type: Boolean, default: false, index: true }
}, schemaOptions);
notificationSchema.index({ acknowledged: 1, createdAt: -1 });

const auditLogSchema = new Schema({
  userId: { type: Schema.Types.ObjectId, ref: "User", default: null, index: true },
  action: { type: String, enum: AUDIT_ACTIONS, required: true },
  entityType: { type: String, required: true, index: true },
  entityId: { type: String, default: null, index: true },
  metadata: { type: Schema.Types.Mixed, default: null },
  ipAddress: { type: String, default: null }
}, schemaOptions);

type RoleType = InferSchemaType<typeof roleSchema>;
type UserType = InferSchemaType<typeof userSchema>;
type CameraGroupType = InferSchemaType<typeof cameraGroupSchema>;
type CameraType = InferSchemaType<typeof cameraSchema>;
type RecordingType = InferSchemaType<typeof recordingSchema>;
type CameraMetricType = InferSchemaType<typeof cameraMetricSchema>;
type NotificationType = InferSchemaType<typeof notificationSchema>;
type AuditLogType = InferSchemaType<typeof auditLogSchema>;

export const Role = (models.Role as Model<RoleType>) || model<RoleType>("Role", roleSchema);
export const User = (models.User as Model<UserType>) || model<UserType>("User", userSchema);
export const CameraGroup = (models.CameraGroup as Model<CameraGroupType>) || model<CameraGroupType>("CameraGroup", cameraGroupSchema);
export const Camera = (models.Camera as Model<CameraType>) || model<CameraType>("Camera", cameraSchema);
export const Recording = (models.Recording as Model<RecordingType>) || model<RecordingType>("Recording", recordingSchema);
export const CameraMetric = (models.CameraMetric as Model<CameraMetricType>) || model<CameraMetricType>("CameraMetric", cameraMetricSchema);
export const Notification = (models.Notification as Model<NotificationType>) || model<NotificationType>("Notification", notificationSchema);
export const AuditLog = (models.AuditLog as Model<AuditLogType>) || model<AuditLogType>("AuditLog", auditLogSchema);
