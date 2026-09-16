using Microsoft.AspNetCore.Mvc;
using Microsoft.Data.SqlClient;
using System;
using System.Collections.Generic;

namespace BucketSolutionsAPI.Controllers
{
    [ApiController]
    [Route("api/[controller]")]
    public class ProductsController : ControllerBase
    {
        private readonly string connString;
        private readonly ILogger<ProductsController> _logger;

        public ProductsController(IConfiguration config, ILogger<ProductsController> logger)
        {
            connString = config.GetConnectionString("DefaultConnection")
                ?? throw new InvalidOperationException("ConnectionStrings:DefaultConnection is not configured.");
            _logger = logger;

            // --- AUTO MIGRATION: adds the low-stock-alert column to an existing
            // live Products table without needing a manual ALTER TABLE run —
            // same pattern SalesController already uses for its own columns.
            try
            {
                using (SqlConnection conn = new SqlConnection(connString))
                {
                    conn.Open();
                    string migrate = @"
                        IF COL_LENGTH('dbo.Products', 'ReorderPoint') IS NULL
                            ALTER TABLE dbo.Products ADD ReorderPoint INT NOT NULL DEFAULT 0;
                    ";
                    using (SqlCommand cmd = new SqlCommand(migrate, conn)) { cmd.ExecuteNonQuery(); }
                }
            }
            catch { /* Fails silently if already migrated or DB briefly unavailable at startup */ }
        }

        // Blueprint for incoming Data (Now includes UOM, Cost, WarehouseQty, and ReorderPoint)
        public class ProductRequest
        {
            public string Barcode { get; set; } = "";
            public string Name { get; set; } = "";
            public decimal Price { get; set; }
            public decimal Cost { get; set; } // Added for Analytics
            public int Stock { get; set; }
            public int WarehouseQty { get; set; } // Added for Warehouse
            public string Type { get; set; } = "";
            public string? UOM { get; set; }
            public int ReorderPoint { get; set; } // Low-stock alert threshold (shop-floor StockQty)
        }

        // 1. GET ALL (Inventory List)
        [HttpGet("all")]
        public IActionResult GetAllProducts()
        {
            try
            {
                using (SqlConnection conn = new SqlConnection(connString))
                {
                    conn.Open();
                    string query = "SELECT Barcode, ProductName, Cost, Price, StockQty, WarehouseQty, InventoryType, UOM, ReorderPoint FROM Products ORDER BY ProductName ASC";
                    using (SqlCommand cmd = new SqlCommand(query, conn))
                    {
                        using (SqlDataReader reader = cmd.ExecuteReader())
                        {
                            var list = new List<object>();
                            while (reader.Read())
                            {
                                int stockQty = Convert.ToInt32(reader["StockQty"]);
                                int reorderPoint = Convert.ToInt32(reader["ReorderPoint"]);
                                list.Add(new
                                {
                                    Barcode = reader["Barcode"].ToString(),
                                    Name = reader["ProductName"].ToString(),
                                    Cost = reader["Cost"] != DBNull.Value ? Convert.ToDecimal(reader["Cost"]) : 0m,
                                    Price = Convert.ToDecimal(reader["Price"]),
                                    Stock = stockQty,
                                    WarehouseQty = reader["WarehouseQty"] != DBNull.Value ? Convert.ToInt32(reader["WarehouseQty"]) : 0,
                                    Type = reader["InventoryType"].ToString(),
                                    UOM = reader["UOM"] != DBNull.Value ? reader["UOM"].ToString() : "Pcs",
                                    ReorderPoint = reorderPoint,
                                    // Only flags when a real threshold is set (0 = alerts disabled for this item)
                                    IsLowStock = reorderPoint > 0 && stockQty <= reorderPoint
                                });
                            }
                            return Ok(list);
                        }
                    }
                }
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Failed to fetch all products");
                return StatusCode(500, "Something went wrong on our end. Please try again.");
            }
        }

        // 1b. GET LOW STOCK (Dashboard warning banner)
        [HttpGet("low-stock")]
        public IActionResult GetLowStockProducts()
        {
            try
            {
                using (SqlConnection conn = new SqlConnection(connString))
                {
                    conn.Open();
                    // ReorderPoint = 0 means alerts are off for that item (no threshold set).
                    string query = @"
                        SELECT Barcode, ProductName, StockQty, ReorderPoint
                        FROM Products
                        WHERE ReorderPoint > 0 AND StockQty <= ReorderPoint
                        ORDER BY (StockQty - ReorderPoint) ASC";
                    using (SqlCommand cmd = new SqlCommand(query, conn))
                    {
                        using (SqlDataReader reader = cmd.ExecuteReader())
                        {
                            var list = new List<object>();
                            while (reader.Read())
                            {
                                list.Add(new
                                {
                                    Barcode = reader["Barcode"].ToString(),
                                    Name = reader["ProductName"].ToString(),
                                    Stock = Convert.ToInt32(reader["StockQty"]),
                                    ReorderPoint = Convert.ToInt32(reader["ReorderPoint"])
                                });
                            }
                            return Ok(list);
                        }
                    }
                }
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Failed to fetch low-stock products");
                return StatusCode(500, "Something went wrong on our end. Please try again.");
            }
        }

        // 2. GET ONE (POS Scanner)
        [HttpGet("{barcode}")]
        public IActionResult GetProductByBarcode(string barcode)
        {
            try
            {
                using (SqlConnection conn = new SqlConnection(connString))
                {
                    conn.Open();
                    string query = "SELECT ProductName, Price, StockQty, UOM FROM Products WHERE Barcode = @Bar";
                    using (SqlCommand cmd = new SqlCommand(query, conn))
                    {
                        cmd.Parameters.AddWithValue("@Bar", barcode);
                        using (SqlDataReader reader = cmd.ExecuteReader())
                        {
                            if (reader.Read())
                            {
                                return Ok(new
                                {
                                    Barcode = barcode,
                                    Name = reader["ProductName"].ToString(),
                                    Price = Convert.ToDecimal(reader["Price"]),
                                    UOM = reader["UOM"] != DBNull.Value ? reader["UOM"].ToString() : "Pcs"
                                });
                            }
                            return NotFound("Not found");
                        }
                    }
                }
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Failed to fetch product {Barcode}", barcode);
                return StatusCode(500, "Something went wrong on our end. Please try again.");
            }
        }

        // 3. CREATE (Add Product)
        [HttpPost]
        public IActionResult AddProduct([FromBody] ProductRequest p)
        {
            try
            {
                using (SqlConnection conn = new SqlConnection(connString))
                {
                    conn.Open();
                    string query = "INSERT INTO Products (Barcode, ProductName, Cost, Price, StockQty, WarehouseQty, InventoryType, UOM, ReorderPoint) VALUES (@B, @N, @C, @P, @S, @WQ, @T, @U, @RP)";
                    using (SqlCommand cmd = new SqlCommand(query, conn))
                    {
                        cmd.Parameters.AddWithValue("@B", p.Barcode);
                        cmd.Parameters.AddWithValue("@N", p.Name);
                        cmd.Parameters.AddWithValue("@C", p.Cost);
                        cmd.Parameters.AddWithValue("@P", p.Price);
                        cmd.Parameters.AddWithValue("@S", p.Stock);
                        cmd.Parameters.AddWithValue("@WQ", p.WarehouseQty);
                        cmd.Parameters.AddWithValue("@T", p.Type);
                        cmd.Parameters.AddWithValue("@U", p.UOM ?? "Pcs");
                        cmd.Parameters.AddWithValue("@RP", p.ReorderPoint);

                        cmd.ExecuteNonQuery();
                    }
                }
                return Ok();
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Failed to add product {Barcode}", p.Barcode);
                return StatusCode(500, "Something went wrong on our end. Please try again.");
            }
        }

        // 4. UPDATE (Edit Product)
        [HttpPut]
        public IActionResult UpdateProduct([FromBody] ProductRequest p)
        {
            try
            {
                using (SqlConnection conn = new SqlConnection(connString))
                {
                    conn.Open();
                    string query = "UPDATE Products SET ProductName=@N, Cost=@C, Price=@P, StockQty=@S, WarehouseQty=@WQ, InventoryType=@T, UOM=@U, ReorderPoint=@RP WHERE Barcode=@B";
                    using (SqlCommand cmd = new SqlCommand(query, conn))
                    {
                        cmd.Parameters.AddWithValue("@B", p.Barcode);
                        cmd.Parameters.AddWithValue("@N", p.Name);
                        cmd.Parameters.AddWithValue("@C", p.Cost);
                        cmd.Parameters.AddWithValue("@P", p.Price);
                        cmd.Parameters.AddWithValue("@S", p.Stock);
                        cmd.Parameters.AddWithValue("@WQ", p.WarehouseQty);
                        cmd.Parameters.AddWithValue("@T", p.Type);
                        cmd.Parameters.AddWithValue("@U", p.UOM ?? "Pcs");
                        cmd.Parameters.AddWithValue("@RP", p.ReorderPoint);

                        cmd.ExecuteNonQuery();
                    }
                }
                return Ok();
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Failed to update product {Barcode}", p.Barcode);
                return StatusCode(500, "Something went wrong on our end. Please try again.");
            }
        }

        // 5. DELETE
        [HttpDelete("{barcode}")]
        public IActionResult DeleteProduct(string barcode)
        {
            try
            {
                using (SqlConnection conn = new SqlConnection(connString))
                {
                    conn.Open();
                    string query = "DELETE FROM Products WHERE Barcode=@B";
                    using (SqlCommand cmd = new SqlCommand(query, conn))
                    {
                        cmd.Parameters.AddWithValue("@B", barcode);
                        cmd.ExecuteNonQuery();
                    }
                }
                return Ok();
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Failed to delete product {Barcode}", barcode);
                return StatusCode(500, "Something went wrong on our end. Please try again.");
            }
        }
    }
}