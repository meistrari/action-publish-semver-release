import * as core from '@actions/core'
import { getExecOutput } from '@actions/exec'
import { context } from '@actions/github'
import { generateChangelog } from './changelog'
import { notifyDiscordChannel } from './discord'
import { getLastCommitMessage, getLastGitTag, tagCommit } from './git'
import { createGithubRelease } from './github'
import { notifySlackChannel } from './slack'
import { getNextVersion, getPureVersion, getReleaseTypeFromCommitMessage, getReleaseTypeFromCommitsSinceLastTag, ReleaseType } from './version'

async function run(): Promise<void> {
    const isReleaseCandidate = core.getInput('release-candidate') === 'true'
    const slackWebhookUrl = core.getInput('slack-webhook-url')
    const discordWebhookUrl = core.getInput('discord-webhook-url')
    const releaseSinceLastTag = core.getInput('release-since-last-tag')
    const useChangelogen = core.getInput('use-changelogen')
    const changelogenVersion = core.getInput('changelogen-version')

    try {
        const currentVersion = await getLastGitTag({
            considerReleaseCandidates: true,
            logInGroup: true,
        })
        if (currentVersion === null)
            return

        let releaseType: ReleaseType | null = null
        if (releaseSinceLastTag) {
            core.info('Inferring release type from contents of the release')
            releaseType = await getReleaseTypeFromCommitsSinceLastTag()
        } else {
            const lastCommitMessage = await getLastCommitMessage()
            if (lastCommitMessage === null)
                return
            core.info(`Inferring release type from last commit message: ${lastCommitMessage}`)
            const releaseType = getReleaseTypeFromCommitMessage(lastCommitMessage)
        }

        // If we're creating a release we want to bump the version
        if (releaseType !== null && releaseType !== 'non-release') {
            core.info(`New release version should be type ${releaseType}`)
            core.setOutput('release-type', releaseType)
            const nextVersion = isReleaseCandidate
                ? getNextVersion({ currentVersion, releaseType })
                : (
                    currentVersion.match(/rc$/)
                        ? getPureVersion(currentVersion)
                        : getNextVersion({ currentVersion, releaseType })
                )
            core.info(`Publishing a release candidate for version ${nextVersion}`)

            const success = await tagCommit(nextVersion, isReleaseCandidate)
            if (success === null) {
                // Action should bail as tag is prerequisite for release
                core.setFailed('Could not tag commit')
                return
            }

            let changelog: string = ''

            if (useChangelogen) {
                core.info('Using changelogen to generate changelog')
                const { stdout, exitCode } = await getExecOutput(
                    `pnpm dlx github:${changelogenVersion} --from ${currentVersion} --to ${nextVersion}`)
                if (exitCode !== 0) {
                    throw Error
                }
                // Make sure the changelog starts with the header text
                changelog = stdout.replace(/^[^#]*##/, '##');
            }
            else {
                core.info('Using built-in changelog generator to generate changelog')
                changelog = await generateChangelog(context)
            }
            await createGithubRelease(context, nextVersion, changelog, isReleaseCandidate)

            if (slackWebhookUrl !== '') {
                await notifySlackChannel(slackWebhookUrl, {
                    projectName: context.repo.repo,
                    projectUrl: core.getInput('project-url'),
                    productionActionUrl: core.getInput('production-action-url'),
                    nextVersion,
                    changelog,
                    isReleaseCandidate,
                })
            }
            if (discordWebhookUrl !== '') {
                await notifyDiscordChannel(discordWebhookUrl, {
                    projectName: context.repo.repo,
                    projectUrl: core.getInput('project-url'),
                    productionActionUrl: core.getInput('production-action-url'),
                    nextVersion,
                    changelog,
                    isReleaseCandidate,
                })
            }

            core.setOutput('next-version', nextVersion)
            core.setOutput('release-type', releaseType)
        }
        else {
            core.info('✅ No new releases to be published!')
        }
    }
    catch (error) {
        if (error instanceof Error)
            core.setFailed(error.message)
    }
}

run()
