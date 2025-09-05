import { eq, ne, sql } from "drizzle-orm";
import { camelCaseObject } from "src/_utils/case";
import { unStringifyDeep } from "src/_utils/unstringify-deep";
import { repositoriesTable } from "src/repository/table";
import { contributionsTable } from "src/contribution/table";
import { contributorsTable } from "src/contributor/table";
import { SQLiteService } from "src/sqlite/service";
import { Service } from "typedi";

import { ProjectRow, projectsTable } from "./table";

@Service()
export class ProjectRepository {
  constructor(private readonly sqliteService: SQLiteService) {}

  public async findForList() {
    // @TODO-ZM: reverse hierarchy instead here
    const statement = sql`
    SELECT
        p.id as id,
        p.name as name,
        p.slug as slug,
        json_group_array(
            json_object('id', r.id, 'owner', r.owner, 'name', r.name)
        ) AS repositories,
        COUNT(DISTINCT c.contributor_id) AS contributors_count,
        SUM(c.activity_count) AS activity_count,
        MAX(repo_activities.repo_activity_count) as max_repo_activity_count
    FROM
        ${projectsTable} p
    LEFT JOIN
        ${repositoriesTable} r ON p.id = r.project_id
    LEFT JOIN
        ${contributionsTable} c ON r.id = c.repository_id
    LEFT JOIN
        (SELECT repository_id, SUM(activity_count) as repo_activity_count FROM ${contributionsTable} GROUP BY repository_id) repo_activities ON r.id = repo_activities.repository_id
    GROUP BY
        p.id;
    `;
    const raw = this.sqliteService.db.all(statement);
    const unStringifiedRaw = unStringifyDeep(raw);
    const camelCased = camelCaseObject(unStringifiedRaw);
    const scored = camelCased.map((p) => ({
      ...p,
      score: (p.maxRepoActivityCount || 0) + (p.contributorsCount || 0),
    }));
    const sorted = scored.sort((a, b) => b.score - a.score);
    return sorted;
  }

  public async upsert(project: ProjectRow) {
    return await this.sqliteService.db
      .insert(projectsTable)
      .values(project)
      .onConflictDoUpdate({
        target: projectsTable.slug,
        set: project,
      })
      .returning({ id: projectsTable.id });
  }

  public async deleteById(id: number) {
    return await this.sqliteService.db.delete(projectsTable).where(eq(projectsTable.id, id));
  }

  public async deleteAllButWithRunId(runId: string) {
    return await this.sqliteService.db.delete(projectsTable).where(ne(projectsTable.runId, runId));
  }
}
