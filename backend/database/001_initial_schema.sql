-- ============================================================================
-- 001_initial_schema.sql
--
-- Full schema for iMarkDB, reverse-engineered from every SQL statement
-- actually present in the C# controllers (SELECT/INSERT/UPDATE column
-- references), not from any prior migration — none existed before this file.
--
-- WHY THIS EXISTS: most of these tables previously had NO creation script
-- anywhere in source control. Three tables (ProductionBatches,
-- ProductionMaterials, StockTransfers, Customers, ReturnLogs) already
-- self-create the first time their controller runs — this script creates
-- those too (idempotently, same IF NOT EXISTS guard the app itself uses)
-- so the entire schema can be rebuilt from ONE place, in order, rather than
-- depending on which controller happens to run first.
--
-- Run this against a fresh database before starting the API for the first
-- time. Safe to re-run — every statement is guarded.
-- ============================================================================

USE iMarkDB;
GO

-- ----------------------------------------------------------------------------
-- Users  (AuthController)
-- ----------------------------------------------------------------------------
IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='Users' AND xtype='U')
CREATE TABLE dbo.Users (
    UserID    INT IDENTITY(1,1) PRIMARY KEY,
    Username  NVARCHAR(100) NOT NULL UNIQUE,
    Password  NVARCHAR(255) NOT NULL, -- hashed by Security/PasswordHasher.cs; see FIXES.md
    FullName  NVARCHAR(200) NOT NULL,
    UserRole  NVARCHAR(50)  NOT NULL DEFAULT 'Cashier',
    Email     NVARCHAR(200) NULL -- used for password-reset links; see AuthController.ForgotPassword
);
GO

-- ----------------------------------------------------------------------------
-- Products  (ProductsController, referenced by nearly everything else)
-- ----------------------------------------------------------------------------
IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='Products' AND xtype='U')
CREATE TABLE dbo.Products (
    Barcode       NVARCHAR(50)  NOT NULL PRIMARY KEY,
    ProductName   NVARCHAR(200) NOT NULL,
    Cost          DECIMAL(18,2) NOT NULL DEFAULT 0,
    Price         DECIMAL(18,2) NOT NULL DEFAULT 0,
    StockQty      INT           NOT NULL DEFAULT 0, -- shop-floor quantity
    WarehouseQty  INT           NOT NULL DEFAULT 0,
    InventoryType NVARCHAR(100) NOT NULL DEFAULT 'Shop FG',
    UOM           NVARCHAR(20)  NULL,
    ReorderPoint  INT           NOT NULL DEFAULT 0 -- low-stock alert threshold; 0 = alerts off for this item
);
GO

-- ----------------------------------------------------------------------------
-- Suppliers  (SuppliersController)
-- ----------------------------------------------------------------------------
IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='Suppliers' AND xtype='U')
CREATE TABLE dbo.Suppliers (
    SupplierID   INT IDENTITY(1,1) PRIMARY KEY,
    SupplierName NVARCHAR(200) NOT NULL,
    ContactInfo  NVARCHAR(200) NULL
);
GO

-- ----------------------------------------------------------------------------
-- Purchases + PurchaseItems + AccountsPayable  (PurchasesController)
-- ----------------------------------------------------------------------------
IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='Purchases' AND xtype='U')
CREATE TABLE dbo.Purchases (
    PurchaseID   INT IDENTITY(1,1) PRIMARY KEY,
    SupplierID   INT NOT NULL,
    TotalCost    DECIMAL(18,2) NOT NULL DEFAULT 0,
    AmountPaid   DECIMAL(18,2) NOT NULL DEFAULT 0,
    PurchasedBy  NVARCHAR(100) NULL,
    PurchaseDate DATETIME NOT NULL DEFAULT GETDATE(),
    FOREIGN KEY (SupplierID) REFERENCES dbo.Suppliers(SupplierID)
);
GO

IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='PurchaseItems' AND xtype='U')
CREATE TABLE dbo.PurchaseItems (
    PurchaseItemID INT IDENTITY(1,1) PRIMARY KEY,
    PurchaseID     INT NOT NULL,
    Barcode        NVARCHAR(50) NOT NULL,
    Quantity       INT NOT NULL,
    UnitCost       DECIMAL(18,2) NOT NULL,
    FOREIGN KEY (PurchaseID) REFERENCES dbo.Purchases(PurchaseID)
);
GO

IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='AccountsPayable' AND xtype='U')
CREATE TABLE dbo.AccountsPayable (
    SupplierID  INT NOT NULL PRIMARY KEY,
    Balance     DECIMAL(18,2) NOT NULL DEFAULT 0,
    LastUpdated DATETIME NOT NULL DEFAULT GETDATE(),
    FOREIGN KEY (SupplierID) REFERENCES dbo.Suppliers(SupplierID)
);
GO

-- ----------------------------------------------------------------------------
-- Expenses  (ExpensesController)
-- ----------------------------------------------------------------------------
IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='Expenses' AND xtype='U')
CREATE TABLE dbo.Expenses (
    ExpenseID   INT IDENTITY(1,1) PRIMARY KEY,
    Description NVARCHAR(500) NOT NULL,
    Amount      DECIMAL(18,2) NOT NULL,
    AddedBy     NVARCHAR(100) NULL,
    UserRole    NVARCHAR(50)  NULL,
    Status      NVARCHAR(50)  NOT NULL DEFAULT 'Pending',
    ExpenseDate DATETIME NOT NULL DEFAULT GETDATE()
);
GO

-- ----------------------------------------------------------------------------
-- Sales + SaleItems  (SalesController)
-- These already self-migrate at runtime (see SalesController's constructor)
-- for the CustomerPhone / PointsEarned / PointsRedeemed / UOM columns —
-- included here as base CREATE statements so a fresh DB gets the full
-- table in one shot instead of needing the API to boot first.
-- ----------------------------------------------------------------------------
IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='Sales' AND xtype='U')
CREATE TABLE dbo.Sales (
    SaleID         INT IDENTITY(1,1) PRIMARY KEY,
    CashierName    NVARCHAR(100) NULL,
    CustomerPhone  NVARCHAR(50)  NULL,
    TotalAmount    DECIMAL(18,2) NOT NULL,
    SaleDate       DATETIME NOT NULL DEFAULT GETDATE(),
    PaymentMethod  NVARCHAR(50)  NULL,
    CashPaid       DECIMAL(18,2) NOT NULL DEFAULT 0,
    CardPaid       DECIMAL(18,2) NOT NULL DEFAULT 0,
    PointsEarned   DECIMAL(18,2) NOT NULL DEFAULT 0,
    PointsRedeemed DECIMAL(18,2) NOT NULL DEFAULT 0
);
GO

IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='SaleItems' AND xtype='U')
CREATE TABLE dbo.SaleItems (
    SaleItemID  INT IDENTITY(1,1) PRIMARY KEY,
    SaleID      INT NOT NULL,
    Barcode     NVARCHAR(50) NOT NULL,
    Qty         INT NOT NULL,
    Price       DECIMAL(18,2) NOT NULL, -- unit price already net of discount, see Checkout()
    UOM         NVARCHAR(20) NULL,
    ReturnedQty INT NOT NULL DEFAULT 0,
    FOREIGN KEY (SaleID) REFERENCES dbo.Sales(SaleID)
);
GO

-- ----------------------------------------------------------------------------
-- ReturnLogs  (SalesController.ProcessReturn) — already self-creates; included
-- here for completeness so the whole schema lives in one script.
-- ----------------------------------------------------------------------------
IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='ReturnLogs' AND xtype='U')
CREATE TABLE dbo.ReturnLogs (
    ReturnLogID  INT IDENTITY(1,1) PRIMARY KEY,
    SaleID       INT NOT NULL,
    Barcode      NVARCHAR(50) NOT NULL,
    ReturnedQty  INT NOT NULL,
    RefundAmount DECIMAL(18,2) NULL,
    ReturnDate   DATETIME NOT NULL,
    FOREIGN KEY (SaleID) REFERENCES dbo.Sales(SaleID)
);
GO

-- ----------------------------------------------------------------------------
-- Customers (loyalty points)  (SalesController) — already self-creates;
-- included here for completeness.
-- ----------------------------------------------------------------------------
IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='Customers' AND xtype='U')
CREATE TABLE dbo.Customers (
    Phone         NVARCHAR(50) PRIMARY KEY,
    LoyaltyPoints DECIMAL(18,2) NOT NULL DEFAULT 0
);
GO

-- ----------------------------------------------------------------------------
-- ProductionBatches + ProductionMaterials  (ProductionController) —
-- already self-create; included here for completeness.
-- ----------------------------------------------------------------------------
IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='ProductionBatches' AND xtype='U')
CREATE TABLE dbo.ProductionBatches (
    BatchId         INT IDENTITY(1,1) PRIMARY KEY,
    FinishedGoodId  NVARCHAR(50) NOT NULL,
    YieldQty        DECIMAL(18,2) NOT NULL,
    ElectricityCost DECIMAL(18,2) DEFAULT 0,
    Wastage         DECIMAL(18,2) DEFAULT 0,
    LoggedBy        NVARCHAR(100),
    ProductionDate  DATETIME DEFAULT GETDATE()
);
GO

IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='ProductionMaterials' AND xtype='U')
CREATE TABLE dbo.ProductionMaterials (
    ProductionMaterialId INT IDENTITY(1,1) PRIMARY KEY,
    BatchId              INT NOT NULL,
    MaterialId            NVARCHAR(50) NOT NULL,
    QtyUsed               DECIMAL(18,2) NOT NULL,
    FOREIGN KEY (BatchId) REFERENCES dbo.ProductionBatches(BatchId)
);
GO

-- ----------------------------------------------------------------------------
-- StockTransfers  (TransfersController) — already self-creates; included
-- here for completeness. NOTE: this is the ItemName/Qty schema that
-- TransfersController actually uses and creates — see FIXES.md for the
-- history of a since-removed duplicate feature that assumed a different,
-- incompatible schema for a table of the same name.
-- ----------------------------------------------------------------------------
IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='StockTransfers' AND xtype='U')
CREATE TABLE dbo.StockTransfers (
    TransferID  INT IDENTITY(1,1) PRIMARY KEY,
    ItemName    NVARCHAR(100) NOT NULL,
    Qty         INT NOT NULL,
    RequestedBy NVARCHAR(100),
    Status      NVARCHAR(50) DEFAULT 'Pending',
    RequestDate DATETIME DEFAULT GETDATE()
);
GO
