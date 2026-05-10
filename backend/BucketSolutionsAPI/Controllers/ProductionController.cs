using Microsoft.AspNetCore.Mvc;
using Microsoft.Data.SqlClient;
using System;
using System.Collections.Generic;

namespace BucketSolutionsAPI.Controllers
{
    [ApiController]
    [Route("api/[controller]")]
    public class ProductionController : ControllerBase
    {
        private readonly string connString = @"Server=sql-server,1433;Database=iMarkDB;User Id=sa;Password=Usman5138@;TrustServerCertificate=True;";

        public class ProductionEntry
        {
            public string FinishedGoodId { get; set; }
            public decimal YieldQty { get; set; }
            public decimal ElectricityCost { get; set; }
            public decimal Wastage { get; set; }
            public string LoggedBy { get; set; }
            public List<MaterialUsage> Materials { get; set; }
        }

        public class MaterialUsage
        {
            public string Id { get; set; }
            public decimal QtyUsed { get; set; }
        }

        [HttpPost("record")]
        public IActionResult RecordProduction([FromBody] ProductionEntry req)
        {
            if (req == null || string.IsNullOrWhiteSpace(req.FinishedGoodId))
                return BadRequest("Invalid production data.");

            using (SqlConnection conn = new SqlConnection(connString))
            {
                conn.Open();
                SqlTransaction trans = conn.BeginTransaction();

                try
                {
                    // 1. CREATE THE BATCH RECORD
                    string batchSql = @"
                        INSERT INTO ProductionBatches (FinishedGoodId, YieldQty, ElectricityCost, Wastage, LoggedBy, ProductionDate)
                        OUTPUT INSERTED.BatchId
                        VALUES (@FG, @Yield, @Elec, @Waste, @By, GETDATE())";

                    int batchId;
                    using (SqlCommand cmd = new SqlCommand(batchSql, conn, trans))
                    {
                        cmd.Parameters.AddWithValue("@FG", req.FinishedGoodId);
                        cmd.Parameters.AddWithValue("@Yield", req.YieldQty);
                        cmd.Parameters.AddWithValue("@Elec", req.ElectricityCost);
                        cmd.Parameters.AddWithValue("@Waste", req.Wastage);
                        cmd.Parameters.AddWithValue("@By", req.LoggedBy ?? "Project Manager");
                        batchId = (int)cmd.ExecuteScalar();
                    }

                    // 2. DEDUCT RAW MATERIALS FROM WAREHOUSE
                    foreach (var rm in req.Materials)
                    {
                        string rmSql = "INSERT INTO ProductionMaterials (BatchId, MaterialId, QtyUsed) VALUES (@BID, @MID, @QtyUsed)";
                        using (SqlCommand cmd = new SqlCommand(rmSql, conn, trans))
                        {
                            cmd.Parameters.AddWithValue("@BID", batchId);
                            cmd.Parameters.AddWithValue("@MID", rm.Id);
                            cmd.Parameters.AddWithValue("@QtyUsed", rm.QtyUsed);
                            cmd.ExecuteNonQuery();
                        }

                        // Deduct Raw Materials from WarehouseQty
                        string sqlStockOut = "UPDATE Products SET WarehouseQty = ISNULL(WarehouseQty, 0) - @qty WHERE Barcode = @id";
                        using (SqlCommand cmd = new SqlCommand(sqlStockOut, conn, trans))
                        {
                            cmd.Parameters.AddWithValue("@qty", rm.QtyUsed);
                            cmd.Parameters.AddWithValue("@id", rm.Id);
                            cmd.ExecuteNonQuery();
                        }
                    }

                    // 3. ADD FINISHED GOOD TO WAREHOUSE
                    // FIXED: Now correctly adds the Yield to WarehouseQty instead of StockQty!
                    string sqlStockIn = "UPDATE Products SET WarehouseQty = ISNULL(WarehouseQty, 0) + @qty WHERE Barcode = @id";
                    using (SqlCommand cmd = new SqlCommand(sqlStockIn, conn, trans))
                    {
                        cmd.Parameters.AddWithValue("@qty", req.YieldQty);
                        cmd.Parameters.AddWithValue("@id", req.FinishedGoodId);
                        cmd.ExecuteNonQuery();
                    }

                    trans.Commit();
                    return Ok(new { message = "Production successful. Warehouse inventory levels updated." });
                }
                catch (Exception ex)
                {
                    trans.Rollback();
                    return StatusCode(500, $"Internal Error: {ex.Message}");
                }
            }
        }

        [HttpGet("history")]
        public IActionResult GetProductionHistory()
        {
            try
            {
                using (SqlConnection conn = new SqlConnection(connString))
                {
                    conn.Open();
                    var batches = new List<Dictionary<string, object>>();

                    string batchQuery = @"
                        SELECT TOP 50 b.BatchId, b.ProductionDate, b.YieldQty, b.ElectricityCost, b.Wastage, b.LoggedBy, p.ProductName as FgName 
                        FROM ProductionBatches b
                        LEFT JOIN Products p ON b.FinishedGoodId = p.Barcode
                        ORDER BY b.ProductionDate DESC";

                    using (SqlCommand cmd = new SqlCommand(batchQuery, conn))
                    using (SqlDataReader reader = cmd.ExecuteReader())
                    {
                        while (reader.Read())
                        {
                            batches.Add(new Dictionary<string, object>
                            {
                                { "BatchId", reader["BatchId"] },
                                { "ProductionDate", reader["ProductionDate"] },
                                { "FinishedGoodName", reader["FgName"]?.ToString() ?? "Unknown FG" },
                                { "YieldQty", reader["YieldQty"] },
                                { "ElectricityCost", reader["ElectricityCost"] != DBNull.Value ? reader["ElectricityCost"] : 0m },
                                { "Wastage", reader["Wastage"] != DBNull.Value ? reader["Wastage"] : 0m },
                                { "LoggedBy", reader["LoggedBy"]?.ToString() ?? "Admin" },
                                { "Materials", new List<object>() }
                            });
                        }
                    }

                    string rmQuery = @"
                        SELECT m.BatchId, m.MaterialId, m.QtyUsed, p.ProductName 
                        FROM ProductionMaterials m
                        LEFT JOIN Products p ON m.MaterialId = p.Barcode";

                    using (SqlCommand cmd = new SqlCommand(rmQuery, conn))
                    using (SqlDataReader reader = cmd.ExecuteReader())
                    {
                        while (reader.Read())
                        {
                            int bId = Convert.ToInt32(reader["BatchId"]);
                            var targetBatch = batches.Find(b => Convert.ToInt32(b["BatchId"]) == bId);

                            if (targetBatch != null)
                            {
                                var materialsList = (List<object>)targetBatch["Materials"];
                                materialsList.Add(new
                                {
                                    MaterialId = reader["MaterialId"]?.ToString(),
                                    Name = reader["ProductName"]?.ToString() ?? "Unknown RM",
                                    QtyUsed = Convert.ToDecimal(reader["QtyUsed"])
                                });
                            }
                        }
                    }

                    return Ok(batches);
                }
            }
            catch (Exception ex) { return StatusCode(500, ex.Message); }
        }
    }
}