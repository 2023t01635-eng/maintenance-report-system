ALTER TABLE "WorkOrder"
ADD COLUMN "providerBusinessName" TEXT,
ADD COLUMN "providerAddress" TEXT,
ADD COLUMN "providerRegistrationNumber" TEXT,
ADD COLUMN "providerContact" TEXT,
ADD COLUMN "invoiceNumber" TEXT;

CREATE TABLE "OrganizationProfile" (
    "id" TEXT NOT NULL DEFAULT 'primary',
    "companyName" TEXT NOT NULL DEFAULT 'University of Colombo - Faculty of Technology',
    "address" TEXT,
    "registrationNumber" TEXT,
    "phone" TEXT,
    "email" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OrganizationProfile_pkey" PRIMARY KEY ("id")
);

INSERT INTO "OrganizationProfile" (
    "id",
    "companyName",
    "createdAt",
    "updatedAt"
) VALUES (
    'primary',
    'University of Colombo - Faculty of Technology',
    CURRENT_TIMESTAMP,
    CURRENT_TIMESTAMP
);
