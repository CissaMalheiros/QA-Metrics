CREATE TABLE "Environment" (
  "id" TEXT NOT NULL PRIMARY KEY, "projectId" TEXT NOT NULL, "name" TEXT NOT NULL,
  "baseUrl" TEXT NOT NULL DEFAULT '', "archived" BOOLEAN NOT NULL DEFAULT false,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "Environment_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "Environment_id_projectId_key" UNIQUE ("id", "projectId"),
  CONSTRAINT "Environment_projectId_name_key" UNIQUE ("projectId", "name")
);
CREATE TABLE "Release" (
  "id" TEXT NOT NULL PRIMARY KEY, "projectId" TEXT NOT NULL, "name" TEXT NOT NULL, "version" TEXT NOT NULL,
  "archived" BOOLEAN NOT NULL DEFAULT false,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "Release_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "Release_id_projectId_key" UNIQUE ("id", "projectId"),
  CONSTRAINT "Release_projectId_version_key" UNIQUE ("projectId", "version")
);
