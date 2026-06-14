import { hash } from "bcryptjs";
import { connectMongo, disconnectMongo } from "../src/lib/mongodb";
import { Camera, CameraGroup, Role, User } from "../src/models";

const roles = [
  {
    name: "Super Admin",
    permissions: [
      "cameras:view", "cameras:manage", "recordings:view",
      "recordings:manage", "users:manage", "settings:manage"
    ]
  },
  {
    name: "Admin",
    permissions: [
      "cameras:view", "cameras:manage", "recordings:view",
      "recordings:manage", "users:manage"
    ]
  },
  {
    name: "Operator",
    permissions: ["cameras:view", "cameras:manage", "recordings:view"]
  },
  {
    name: "Viewer",
    permissions: ["cameras:view", "recordings:view"]
  }
];

const cameras = [
  {
    pathName: "cam1",
    name: "Main Entrance",
    description: "Primary synthetic camera with continuous recording.",
    location: "Main Entrance",
    sourceUrl: "rtsp://mediamtx-simulator:18554/vcam1",
    streamType: "RTSP",
    enabled: true,
    recordingEnabled: false,
    retentionDays: 1,
    recordSegmentDuration: 60,
    status: "UNKNOWN"
  },
  {
    pathName: "cam2",
    name: "Training Room",
    description: "Secondary synthetic camera without recording.",
    location: "Training Room",
    sourceUrl: "rtsp://mediamtx-simulator:18554/vcam2",
    streamType: "RTSP",
    enabled: true,
    recordingEnabled: false,
    retentionDays: 1,
    recordSegmentDuration: 60,
    status: "UNKNOWN"
  }
] as const;

async function main() {
  await connectMongo();
  for (const role of roles) {
    await Role.findOneAndUpdate(
      { name: role.name },
      { $set: role },
      { upsert: true, new: true, runValidators: true }
    );
  }
  const superAdmin = await Role.findOne({ name: "Super Admin" }).orFail();
  const email = (process.env.SEED_ADMIN_EMAIL ?? "admin@example.com").toLowerCase();
  const password = process.env.SEED_ADMIN_PASSWORD ?? "ChangeMe123!";
  await User.updateOne(
    { email },
    {
      $setOnInsert: {
        email,
        name: "System Administrator",
        passwordHash: await hash(password, 12),
        roleId: superAdmin._id,
        active: true
      }
    },
    { upsert: true }
  );

  const group = await CameraGroup.findOneAndUpdate(
    { name: "Simulator Cameras" },
    {
      $set: {
        name: "Simulator Cameras",
        description: "Streams prepared by infra/mediamtx/simulator.yml"
      }
    },
    { upsert: true, new: true, runValidators: true }
  );

  await Camera.deleteOne({ pathName: "cam3" });

  for (const camera of cameras) {
    await Camera.findOneAndUpdate(
      { pathName: camera.pathName },
      { $set: { ...camera, groupId: group._id } },
      { upsert: true, new: true, runValidators: true }
    );
  }
}

main()
  .then(() => console.log("MongoDB roles, administrator, and MediaMTX cameras seeded"))
  .finally(disconnectMongo);
