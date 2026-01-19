/// <reference types="@caido/sdk-backend" />

import type { SDK } from "caido:plugin";
import { ScanHistoryOptions } from "../../shared/types.js";

export class HistoryScanner {
  /**
   * Scans proxy history and returns request IDs matching the filter and limit.
   * 
   * @param sdk - The Caido SDK instance
   * @param options - Scan configuration (limit, scanAll, filter)
   * @returns Array of request IDs ordered by creation time descending
   */
  public async scan(sdk: SDK, options: ScanHistoryOptions): Promise<string[]> {
    const { limit, scanAll, filter } = options;
    const ids: string[] = [];
    
    try {
      // Build base query ordered by creation time descending (most recent first)
      let query = sdk.requests.query().descending("req", "created_at");
      
      // Apply HTTPQL filter if provided
      if (filter && filter.trim().length > 0) {
        query = query.filter(filter.trim());
      }
      
      // Determine how many requests to fetch per page
      const pageSize = scanAll ? 1000 : Math.min(limit, 1000);
      
      // Paginate through results
      let hasMore = true;
      let cursor: string | null = null;
      
      while (hasMore) {
        // Build paginated query
        const paginatedQuery: ReturnType<typeof query.first> = cursor 
          ? query.after(cursor).first(pageSize)
          : query.first(pageSize);
        
        // Execute query
        const page: Awaited<ReturnType<typeof paginatedQuery.execute>> = await paginatedQuery.execute();
        
        // Collect request IDs
        for (const item of page.items) {
          ids.push(item.request.getId());
          
          // Stop if we've reached the limit (when not scanning all)
          if (!scanAll && ids.length >= limit) {
            hasMore = false;
            break;
          }
        }
        
        // Check if there are more pages
        if (hasMore && page.pageInfo.hasNextPage && page.pageInfo.endCursor) {
          cursor = page.pageInfo.endCursor;
        } else {
          hasMore = false;
        }
      }
      
      sdk.console.log(`HistoryScanner: Collected ${ids.length} request IDs`);
      return ids;
      
    } catch (error: unknown) {
      sdk.console.error("HistoryScanner: scan failed", error);
      throw new Error(`Failed to scan history: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
}
